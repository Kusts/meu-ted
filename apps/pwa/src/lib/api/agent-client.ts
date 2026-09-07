import { z } from "zod";
import { apiFetch, isApiConfigured } from "./client";
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
}).transform((item) => ({
  id: item.id,
  actorId: item.actorId ?? (item.role === "assistant" ? "ted" : "unknown"),
  role: item.role,
  content: item.content ?? item.text ?? "",
  createdAt: item.createdAt,
  isOwn: item.isOwn,
  attachments: item.attachments,
}));

const historySchema = z.object({
  items: z.array(historyItemSchema),
  total: z.number().optional(),
});

export type AgentMessage = z.infer<typeof historyItemSchema>;

function agentBaseUrl(): string {
  const direct = process.env.NEXT_PUBLIC_PI_FINANCE_AGENT_BASE_URL?.replace(/\/$/, "");
  if (direct) return direct;
  // Fallback seguro ao proxy Next.js /api/agent quando a URL direta não estiver configurada.
  // Preserva token e X-Workspace-Id via forwardHeaders do proxy e evita CORS/misconfig.
  return "/api/agent";
}

export type AgentTurn = { turnId: string; status: string; attempts?: number; output?: string; memorized?: string[] };

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

const pendingOperationSchema = z.object({
  id: z.string(),
  householdId: z.string(),
  requesterId: z.string(),
  operation: z.string(),
  payload: z.unknown(),
  reason: z.enum(["high_value", "destructive"]),
  idempotencyKey: z.string(),
  status: z.enum(["pending", "approved", "rejected", "expired"]),
  createdAt: z.string(),
  expiresAt: z.string(),
}).passthrough();
const pendingOperationsSchema = z.object({ items: z.array(pendingOperationSchema), total: z.number() });
export type PendingOperation = z.infer<typeof pendingOperationSchema>;

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
  opts?: { attachments?: Array<{ type: string; url: string; name: string }> },
): Promise<AgentTurn> {
  const baseUrl = agentBaseUrl();
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
      body: JSON.stringify({ text: content, attachments: opts?.attachments }),
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
  const data = await response.json() as { turnId?: string; intentionId?: string; status?: string; output?: string; memorized?: string[] };
  return {
    turnId: data.turnId ?? data.intentionId ?? `turn-${Date.now()}`,
    status: data.status ?? "completed",
    output: data.output,
    ...(Array.isArray(data.memorized) ? { memorized: data.memorized.filter((m): m is string => typeof m === "string") } : {}),
  };
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

export async function retryAgentTurn(workspaceId: string, turnId: string): Promise<AgentTurn> {
  const response = await fetch(agentRequestUrl(workspaceId, `/${encodeURIComponent(turnId)}/retry`), {
    method: "POST", credentials: "include", headers: { "X-Workspace-Id": workspaceId },
  });
  return parseJson<AgentTurn>(response);
}

export async function processAgentTurn(workspaceId: string, turnId: string): Promise<AgentTurn> {
  const response = await fetch(agentRequestUrl(workspaceId, `/${encodeURIComponent(turnId)}/process`), {
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

export async function fetchPendingOperations(workspaceId: string): Promise<PendingOperation[]> {
  if (!isApiConfigured()) return [];
  const response = await apiFetch<z.infer<typeof pendingOperationsSchema>>(`/pending-operations?status=pending`, {
    responseSchema: pendingOperationsSchema,
    headers: { "X-Workspace-Id": workspaceId },
  });
  return response.items;
}

export async function approvePendingOperation(workspaceId: string, pendingOperationId: string): Promise<PendingOperation> {
  return apiFetch<PendingOperation>(`/pending-operations/${encodeURIComponent(pendingOperationId)}/approve`, {
    method: "POST",
    responseSchema: pendingOperationSchema,
    headers: { "X-Workspace-Id": workspaceId },
  });
}

export async function rejectPendingOperation(workspaceId: string, pendingOperationId: string): Promise<PendingOperation> {
  return apiFetch<PendingOperation>(`/pending-operations/${encodeURIComponent(pendingOperationId)}/reject`, {
    method: "POST",
    responseSchema: pendingOperationSchema,
    headers: { "X-Workspace-Id": workspaceId },
  });
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
