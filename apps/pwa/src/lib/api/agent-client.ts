import { z } from "zod";
import { fetchAgentConnectionToken, clearAgentConnectionTokenCache, trackAgentConnection } from "./agent-auth";

export const attachmentSchema = z.object({
  type: z.enum(["image", "pdf", "audio"]),
  url: z.string(),
  name: z.string().optional(),
});

const historyItemSchema = z.object({
  id: z.string(),
  actorId: z.string().optional(),
  role: z.string(),
  content: z.string().optional(),
  text: z.string().optional(),
  createdAt: z.string().optional(),
  isOwn: z.boolean(),
  attachments: z.array(attachmentSchema).optional(),
  // §25.4 (browser reload during proposed/executing): the server may attach
  // the authoritative pending operation so the PWA rehydrates the approval
  // card from SERVER state. Raw input — sanitized in the transform below.
  pendingOperation: z.unknown().optional(),
}).transform((item): AgentMessage => {
  const pendingOperation = sanitizePendingOperation(
    item.pendingOperation as AgentTurn["pendingOperation"],
  );
  return {
    id: item.id,
    actorId: item.actorId ?? (item.role === "assistant" ? "ted" : "unknown"),
    role: item.role,
    content: item.content ?? item.text ?? "",
    createdAt: item.createdAt,
    isOwn: item.isOwn,
    attachments: item.attachments,
    // Invalid/absent collapses to no card — never invented data.
    ...(pendingOperation === undefined ? {} : { pendingOperation }),
  };
});

const historySchema = z.object({
  items: z.array(historyItemSchema),
  total: z.number().optional(),
});

export type AgentMessage = {
  id: string;
  actorId: string;
  role: string;
  content: string;
  createdAt: string | undefined;
  isOwn: boolean;
  attachments?: Array<z.infer<typeof attachmentSchema>>;
  /**
   * §25.4: authoritative pending operation attached to a history item, when
   * the server emitted one. Same allowlist as the turn path — absent or
   * invalid means `undefined` (no card), never invented data.
   */
  pendingOperation?: AgentTurn["pendingOperation"];
};

function agentBaseUrl(): string {  // ADR-011: canonical browser transport is the same-origin proxy /api/agent.
  // An explicitly configured direct URL is transient test-env compatibility
  // only — never a silent production default.
  const direct = process.env.NEXT_PUBLIC_PI_FINANCE_AGENT_BASE_URL?.replace(/\/$/, "");
  if (direct) return direct;
  // Fallback seguro ao proxy Next.js /api/agent quando a URL direta não estiver configurada.
  // Preserva token e X-Workspace-Id via forwardHeaders do proxy e evita CORS/misconfig.
  return "/api/agent";
}

const pendingOperationPresentationLabelSchema = z
  .object({ id: z.string(), label: z.string() })
  .strict();

/**
 * T3.4 (SPEC §16): browser-safe card projection. Strict: attestation and
 * authority material are rejected — the card carries display data only.
 * Every field is optional except identity/title/expiry so legacy payloads
 * (old in-flight ops without a presentation) still parse.
 */
const pendingOperationPresentationSchema = z
  .object({
    id: z.string(),
    status: z.string(),
    tool: z.string(),
    title: z.string(),
    amountCents: z.number().optional(),
    description: z.string().optional(),
    date: z.string().optional(),
    account: pendingOperationPresentationLabelSchema.optional(),
    category: pendingOperationPresentationLabelSchema.optional(),
    expiresAt: z.string(),
    warnings: z.array(z.string()),
  })
  .strict();

export type PendingOperationPresentation = z.infer<typeof pendingOperationPresentationSchema>;

export const PENDING_OPERATION_STATUS = [
  "proposed",
  "confirmed",
  "executing",
  "succeeded",
  "failed",
  "cancelled",
  "expired",
] as const;

export type PendingOperationStatus = (typeof PENDING_OPERATION_STATUS)[number];

export type AgentTurn = {
  turnId: string;
  status: string;
  attempts?: number;
  output?: string;
  memorized?: string[];
  pendingOperation?: Readonly<{
    id: string;
    status: PendingOperationStatus;
    operation: string;
    summary?: string;
    presentation?: PendingOperationPresentation;
  }>;
};

/**
 * SPEC §16 visible-states contract (pt-BR), testable mapping from the
 * authoritative operation status to what the TED must show. Clarification
 * and stale states belong to T3.3 and are intentionally absent here.
 */
export const PENDING_OPERATION_STATUS_LABELS: Readonly<Record<PendingOperationStatus, string>> = {
  proposed: "aguardando aprovação",
  confirmed: "confirmada — processando operação…",
  executing: "processando operação…",
  succeeded: "concluída",
  failed: "falhou",
  cancelled: "cancelada",
  expired: "expirada",
};

export function describePendingOperationStatus(status: string): string {
  return (PENDING_OPERATION_STATUS_LABELS as Readonly<Record<string, string>>)[status] ?? status;
}

/** pt-BR currency for the card and the confirm button (cents → "R$ 850,00"). */
export function formatCentsToBRL(cents: number): string {
  return `R$ ${(cents / 100).toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
}

/** Canonical YYYY-MM-DD → pt-BR "DD/MM/YYYY"; unknown shapes pass through. */
export function formatDateToBR(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim());
  return match ? `${match[3]}/${match[2]}/${match[1]}` : isoDate;
}

/**
 * Allowlisted pending-operation DTO: only card-safe fields cross into the
 * turn. A presentation carrying attestation (or any unknown key) is
 * dropped — the operation itself still surfaces in its legacy shape.
 */
function sanitizePendingOperation(
  value: AgentTurn["pendingOperation"],
): AgentTurn["pendingOperation"] {
  if (!value || typeof value.id !== "string" || typeof value.operation !== "string") return undefined;
  if (!(PENDING_OPERATION_STATUS as readonly string[]).includes(value.status)) return undefined;
  const { id, status, operation } = value;
  const summary = typeof value.summary === "string" ? value.summary : undefined;
  const parsedPresentation =
    value.presentation && typeof value.presentation === "object"
      ? pendingOperationPresentationSchema.safeParse(value.presentation)
      : null;
  return {
    id,
    status,
    operation,
    ...(summary !== undefined ? { summary } : {}),
    ...(parsedPresentation && parsedPresentation.success ? { presentation: parsedPresentation.data } : {}),
  };
}

/**
 * SPEC §7.7/§7.7.1 — stable per-turn message identity (PWA-owned).
 *
 * Every outgoing chat message gets a `messageId` generated ONCE at send
 * composition. Retries of the same send MUST reuse it (pass
 * `{ messageId }` back into `sendAgentMessage`); the id is sent as the
 * Agent's `intentionId`, so a lost HTTP response can never produce a second
 * proposal. Never regenerate on retry; a new message composes a new id.
 */
export type PendingChatSend = Readonly<{
  messageId: string;
  content: string;
  createdAt: string;
  attachments?: ReadonlyArray<Readonly<{ type: string; url: string; name: string }>>;
}>;

export function createChatMessageId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

export function composeChatSend(
  content: string,
  opts?: {
    attachments?: Array<{ type: string; url: string; name: string }>;
    messageId?: string;
  },
): PendingChatSend {
  const messageId = opts?.messageId && opts.messageId.trim() ? opts.messageId.trim() : createChatMessageId();
  return {
    messageId,
    content,
    createdAt: new Date().toISOString(),
    ...(opts?.attachments ? { attachments: opts.attachments } : {}),
  };
}

const pendingSendKey = (workspaceId: string): string => `ted.pending-send.${workspaceId}`;

/**
 * Persists the in-flight send record (messageId + content only — never
 * secrets) so a page reload restores the same id for retry.
 */
export function savePendingChatSend(workspaceId: string, send: PendingChatSend): void {
  try {
    sessionStorage.setItem(
      pendingSendKey(workspaceId),
      JSON.stringify({ messageId: send.messageId, content: send.content, createdAt: send.createdAt }),
    );
  } catch {
    // Storage unavailable (private mode): the in-memory retry path still reuses the id.
  }
}

export function loadPendingChatSend(workspaceId: string): PendingChatSend | null {
  try {
    const raw = sessionStorage.getItem(pendingSendKey(workspaceId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { messageId?: unknown; content?: unknown; createdAt?: unknown };
    if (typeof parsed.messageId !== "string" || !parsed.messageId || typeof parsed.content !== "string") return null;
    return {
      messageId: parsed.messageId,
      content: parsed.content,
      createdAt: typeof parsed.createdAt === "string" ? parsed.createdAt : new Date(0).toISOString(),
    };
  } catch {
    return null;
  }
}

export function clearPendingChatSend(workspaceId: string): void {
  try {
    sessionStorage.removeItem(pendingSendKey(workspaceId));
  } catch {
    // Best effort.
  }
}

const pendingDecisionSchema = z.object({
  operationId: z.string(),
  status: z.enum(["proposed", "succeeded", "failed", "cancelled", "expired"]),
  retryable: z.boolean().optional(),
}).strict();

/** Safe result of an approval decision. Attestations never cross the browser boundary. */
export type PendingOperationDecision = z.infer<typeof pendingDecisionSchema>;

const agentHistoryExportSchema = z.object({
  version: z.number(),
  exportedAt: z.string(),
  turns: z.array(z.unknown()),
  messages: z.array(z.unknown()),
  actions: z.array(z.unknown()),
  events: z.array(z.unknown()),
});
export type AgentHistoryExport = z.infer<typeof agentHistoryExportSchema>;
const deleteAgentHistorySchema = z.object({ deleted: z.boolean(), recordCount: z.number() });
export type DeleteAgentHistoryResult = z.infer<typeof deleteAgentHistorySchema>;
const accessLogSchema = z.object({ items: z.array(z.object({ id: z.number(), actor_id: z.string(), action: z.string(), record_count: z.number(), created_at: z.string() })) });
export type AgentAccessLog = z.infer<typeof accessLogSchema>;

function agentRequestUrl(workspaceId: string, suffix: string): string {
  const baseUrl = agentBaseUrl();
  return `${baseUrl}/agents/workspace/${encodeURIComponent(workspaceId)}/message${suffix}`;
}

function agentHistoryUrl(workspaceId: string, suffix: string): string {
  const baseUrl = agentBaseUrl();
  return `${baseUrl}/agents/workspace/${encodeURIComponent(workspaceId)}/history${suffix}`;
}

async function parseJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let errorMsg = "Operação do agente falhou.";
    try {
      const body = await response.json() as { message?: string };
      if (body?.message) errorMsg = body.message;
    } catch {
      // fallback
    }
    throw new Error(errorMsg);
  }
  return await response.json() as T;
}

async function agentAuthHeaders(workspaceId: string, forceFresh = false): Promise<Record<string, string>> {
  // C-01: connection tokens are single-use — every call mints fresh.
  const token = await fetchAgentConnectionToken(workspaceId, forceFresh);
  return { "x-agent-connection-token": token };
}

const peekErrorCode = async (response: Response): Promise<string | undefined> => {
  try {
    return ((await response.clone().json()) as { code?: string })?.code;
  } catch {
    return undefined;
  }
};

/**
 * Authenticated agent fetch (H-05/C-01): fresh single-use token per call;
 * exactly ONE retry on `agent.token_replayed` (stale bearer raced with the
 * single-use consumption); cache invalidated on any 401/403 so logout,
 * user switch and workspace switch never reuse a previous bearer.
 */
async function fetchWithAgentAuth(workspaceId: string, url: string, init: RequestInit): Promise<Response> {
  const attempt = async (): Promise<Response> => {
    const authHeaders = await agentAuthHeaders(workspaceId, true);
    // H-13: the flight is tracked so logout/401/workspace-switch aborts it.
    // The caller's own signal (if any) is linked, never replaced.
    const callerSignal = init.signal instanceof AbortSignal ? init.signal : null;
    const { signal, release } = trackAgentConnection(callerSignal);
    try {
      return await fetch(url, {
        ...init,
        headers: { ...((init.headers as Record<string, string> | undefined) ?? {}), ...authHeaders },
        signal,
      });
    } finally {
      release();
    }
  };
  let res = await attempt();
  if (res.ok) return res;
  if ((await peekErrorCode(res)) === "agent.token_replayed") {
    clearAgentConnectionTokenCache();
    res = await attempt();
    if (res.ok) return res;
  } else if (res.status === 401 || res.status === 403) {
    clearAgentConnectionTokenCache();
  }
  return res;
}

export async function sendAgentMessage(
  workspaceId: string,
  content: string,
  opts?: { attachments?: Array<{ type: string; url: string; name: string }>; messageId?: string },
): Promise<AgentTurn> {
  const baseUrl = agentBaseUrl();
  // SPEC §7.7: the send identity is fixed ONCE here; retries pass the same
  // messageId back and the pending record keeps it across reloads.
  const messageId = opts?.messageId && opts.messageId.trim() ? opts.messageId.trim() : createChatMessageId();
  savePendingChatSend(workspaceId, {
    messageId,
    content,
    createdAt: new Date().toISOString(),
    ...(opts?.attachments ? { attachments: opts.attachments } : {}),
  });
  const response = await fetchWithAgentAuth(
    workspaceId,
    `${baseUrl}/agents/finance-chat-agent/${encodeURIComponent(workspaceId)}/rpc/chat`,
    {
      method: "POST",
      credentials: "include",
      headers: {
        "content-type": "application/json",
        "X-Workspace-Id": workspaceId,
      },
      body: JSON.stringify({ text: content, attachments: opts?.attachments, intentionId: messageId }),
    },
  );
  if (!response.ok) {
    let errorMsg = "Operação do agente falhou.";
    let errorCode: string | undefined;
    try {
      const errBody = await response.json() as { message?: string; code?: string };
      if (errBody?.message) errorMsg = errBody.message;
      if (errBody?.code) errorCode = errBody.code;
    } catch {
      // use default message
    }
    // Preserve 401/403 sem mascarar: anexa code/status ao erro para caller distinguir sem vazar segredo
    const err = new Error(errorMsg) as Error & { status?: number; code?: string };
    err.status = response.status;
    if (errorCode) err.code = errorCode;
    else if (response.status === 401) err.code = "auth.session_required";
    else if (response.status === 403) err.code = "auth.workspace_forbidden";
    throw err;
  }
  const data = await response.json() as { turnId?: string; intentionId?: string; status?: string; output?: string; memorized?: string[]; pendingOperation?: AgentTurn["pendingOperation"] };
  // The turn landed: the in-flight record is no longer needed. On failure
  // (throw above) it stays, so retry reuses the same messageId.
  clearPendingChatSend(workspaceId);
  return {
    turnId: data.turnId ?? data.intentionId ?? `turn-${Date.now()}`,
    status: data.status ?? "completed",
    output: data.output,
    ...(Array.isArray(data.memorized) ? { memorized: data.memorized.filter((m): m is string => typeof m === "string") } : {}),
    ...(sanitizePendingOperation(data.pendingOperation) ? { pendingOperation: sanitizePendingOperation(data.pendingOperation) } : {}),
  };
}

/**
 * Sends a user decision to the authenticated Agent. The Agent, not the
 * browser, owns V2 confirmation, credential consumption and execution.
 */
export async function decidePendingOperation(
  workspaceId: string,
  operationId: string,
  decision: "confirm" | "cancel" | "retry",
): Promise<PendingOperationDecision> {
  const baseUrl = agentBaseUrl();
  const requestId = crypto.randomUUID();
  const response = await fetchWithAgentAuth(
    workspaceId,
    `${baseUrl}/agents/finance-chat-agent/${encodeURIComponent(workspaceId)}/rpc/pending-operations/${encodeURIComponent(operationId)}/decision`,
    {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json", "X-Workspace-Id": workspaceId },
      body: JSON.stringify({ decision, requestId }),
    },
  );
  return pendingDecisionSchema.parse(await parseJson<unknown>(response));
}

export type AgentSessionRenewal = {
  ok: boolean;
  sessionId: string;
  previousSessionId: string | null;
  messageCount: number;
  summarized: boolean;
};

/**
 * Starts a fresh chat session (Part B): archives the current context into
 * the session registry and clears the model context. Durable memories are
 * kept. Plain fetch (same shape as sendAgentMessage) — intentionally not
 * an apiFetch endpoint write.
 */
export async function renewAgentSession(workspaceId: string): Promise<AgentSessionRenewal> {
  const baseUrl = agentBaseUrl();
  const response = await fetchWithAgentAuth(
    workspaceId,
    `${baseUrl}/agents/finance-chat-agent/${encodeURIComponent(workspaceId)}/rpc/session/new`,
    {
      method: "POST",
      credentials: "include",
      headers: {
        "content-type": "application/json",
        "X-Workspace-Id": workspaceId,
      },
      body: JSON.stringify({}),
    },
  );
  if (!response.ok) throw new Error("Não foi possível iniciar uma nova sessão.");
  return (await response.json()) as AgentSessionRenewal;
}

export async function cancelAgentTurn(workspaceId: string, turnId: string): Promise<AgentTurn> {
  const response = await fetch(agentRequestUrl(workspaceId, `/${encodeURIComponent(turnId)}/abort`), {
    method: "POST", credentials: "include", headers: { "X-Workspace-Id": workspaceId },
  });
  return parseJson<AgentTurn>(response);
}

export type AgentEvent = { id: number; type: string; data: string };

function parseAgentEvents(body: string): AgentEvent[] {
  return body.trim().split(/\n\n+/).filter(Boolean).map((chunk) => {
    const lines = chunk.split("\n");
    const id = Number(lines.find((line) => line.startsWith("id:"))?.slice(3).trim() ?? 0);
    const type = lines.find((line) => line.startsWith("event:"))?.slice(6).trim() ?? "status";
    const data = lines.find((line) => line.startsWith("data:"))?.slice(5).trim() ?? "{}";
    return { id, type, data };
  });
}

export async function reconnectAgentTurn(workspaceId: string, turnId: string, lastEventId = 0): Promise<AgentEvent[]> {
  let cursor = lastEventId;
  const events: AgentEvent[] = [];
  for (let attempt = 0; attempt < 30; attempt += 1) {
    let body: string;
    try {
      body = await streamAgentTurn(workspaceId, turnId, cursor);
    } catch (error) {
      if (attempt === 2) throw error;
      continue;
    }
    const next = parseAgentEvents(body);
    events.push(...next);
    if (next.length === 0) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      continue;
    }
    cursor = next[next.length - 1]!.id;
    if (next.some((event) => ["completed", "failed", "aborted"].includes(event.type))) break;
  }
  return events;
}

export async function streamAgentTurn(workspaceId: string, turnId: string, lastEventId = 0): Promise<string> {
  // H-13: tracked so session clears abort a hanging SSE reconnect.
  const { signal, release } = trackAgentConnection();
  try {
    const response = await fetch(agentRequestUrl(workspaceId, `/stream/${encodeURIComponent(turnId)}`), {
      credentials: "include",
      headers: { "Accept": "text/event-stream", "Last-Event-ID": String(lastEventId), "X-Workspace-Id": workspaceId },
      signal,
    });
    if (!response.ok) throw new Error("Reconexão do agente falhou.");
    return await response.text();
  } finally {
    release();
  }
}

export async function exportAgentHistory(workspaceId: string): Promise<AgentHistoryExport> {
  const response = await fetch(agentHistoryUrl(workspaceId, "/export"), {
    credentials: "include",
    headers: { "X-Workspace-Id": workspaceId },
  });
  return parseJson<AgentHistoryExport>(response).then((body) => agentHistoryExportSchema.parse(body));
}

export async function deleteAgentHistory(workspaceId: string): Promise<DeleteAgentHistoryResult> {
  const response = await fetch(agentHistoryUrl(workspaceId, ""), {
    method: "DELETE",
    credentials: "include",
    headers: { "X-Workspace-Id": workspaceId },
  });
  return parseJson<DeleteAgentHistoryResult>(response).then((body) => deleteAgentHistorySchema.parse(body));
}

export async function fetchAgentAccessLog(workspaceId: string): Promise<AgentAccessLog> {
  const response = await fetch(agentHistoryUrl(workspaceId, "/access-log"), {
    credentials: "include",
    headers: { "X-Workspace-Id": workspaceId },
  });
  return parseJson<AgentAccessLog>(response).then((body) => accessLogSchema.parse(body));
}

export async function fetchAgentHistory(workspaceId: string): Promise<AgentMessage[]> {
  const baseUrl = agentBaseUrl();
  const response = await fetchWithAgentAuth(
    workspaceId,
    `${baseUrl}/agents/finance-chat-agent/${encodeURIComponent(workspaceId)}/rpc/history`,
    {
      credentials: "include",
      headers: {
        "X-Workspace-Id": workspaceId,
      },
    },
  );
  if (!response.ok) {
    let errorMsg = "Não foi possível carregar o histórico do agente.";
    let errorCode: string | undefined;
    try {
      const errBody = await response.json() as { message?: string; code?: string };
      if (errBody?.message) errorMsg = errBody.message;
      if (errBody?.code) errorCode = errBody.code;
    } catch {
      // use default message
    }
    const err = new Error(errorMsg) as Error & { status?: number; code?: string };
    err.status = response.status;
    if (errorCode) err.code = errorCode;
    else if (response.status === 401) err.code = "auth.session_required";
    else if (response.status === 403) err.code = "auth.workspace_forbidden";
    throw err;
  }
  const json = await response.json();
  return historySchema.parse(json).items;
}
