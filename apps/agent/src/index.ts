import { DurableObject } from "cloudflare:workers";
import { initializeWorkspaceAgentSchema, WORKSPACE_AGENT_SCHEMA_VERSION } from "./schema";
import { createDelegatedTurnToken, type DelegatedRole } from "./delegated-token";
import { redactTranscript, redactTranscriptJson } from "./transcript-safety";

const MAX_TURN_ATTEMPTS = 3;
const MAX_TURN_TOKENS = 1_000;
const DEFAULT_DAILY_TOKEN_BUDGET = 10_000;
const DEFAULT_RATE_LIMIT_MAX_REQUESTS = 20;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RETENTION_DAYS = 180;
const RETENTION_MS = RETENTION_DAYS * 24 * 60 * 60 * 1_000;
const RETENTION_ALARM_MS = 24 * 60 * 60 * 1_000;

const estimateTokens = (text: string): number => Math.ceil(text.length / 4);

type MessageRow = {
  id: string;
  actor_id: string;
  role: string;
  content_json: string;
  created_at: string;
};

type TurnRow = { id: string; intention_id?: string; actor_id: string; status: string; attempts: number; token_budget: number; tokens_used: number; input_json?: string; output_json?: string };
type TurnEvent = { turn_id: string; event_id: number; event_type: string; payload_json: string; created_at?: string };
type ActionRow = { id: string; actor_id: string; action_type: string; payload_json: string; created_at?: string };
type AccessLogRow = { id: number; actor_id: string; action: string; record_count: number; created_at: string };
export type TurnProcessor = (input: { messageId: string; intentionId: string; content: string; role?: DelegatedRole; capabilities?: string[] }, signal: AbortSignal, delegatedToken?: string) => Promise<string>;

const DEFAULT_TURN_CAPABILITIES = ['financial.read', 'financial.write'];

const parsePositiveLimit = (raw: string | undefined, fallback: number): number => {
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

type AgentRuntimeEnv = {
  AGENT_DELEGATION_SECRET?: string;
  AGENT_DAILY_TOKEN_BUDGET?: string;
  AGENT_RATE_LIMIT_MAX_REQUESTS?: string;
};

export class WorkspaceAgent extends DurableObject<AgentRuntimeEnv> {
  private readonly activeControllers = new Map<string, AbortController>();
  private readonly delegationSecret: string;
  private readonly dailyTokenBudget: number;
  private readonly rateLimitMaxRequests: number;

  constructor(ctx: DurableObjectState, env?: AgentRuntimeEnv) {
    super(ctx, env ?? ({} as AgentRuntimeEnv));
    this.delegationSecret = env?.AGENT_DELEGATION_SECRET?.trim() ?? '';
    this.dailyTokenBudget = parsePositiveLimit(env?.AGENT_DAILY_TOKEN_BUDGET, DEFAULT_DAILY_TOKEN_BUDGET);
    this.rateLimitMaxRequests = parsePositiveLimit(env?.AGENT_RATE_LIMIT_MAX_REQUESTS, DEFAULT_RATE_LIMIT_MAX_REQUESTS);
    initializeWorkspaceAgentSchema(ctx.storage.sql);
    ctx.storage.sql.exec(`UPDATE turn_queue
      SET status = 'queued', updated_at = CURRENT_TIMESTAMP
      WHERE status = 'running' AND lease_until < CURRENT_TIMESTAMP AND attempts < ${MAX_TURN_ATTEMPTS}`);
    ctx.storage.sql.exec(`UPDATE turn_queue
      SET status = 'failed', updated_at = CURRENT_TIMESTAMP
      WHERE status = 'running' AND lease_until < CURRENT_TIMESTAMP AND attempts >= ${MAX_TURN_ATTEMPTS}`);
    ctx.storage.setAlarm?.(Date.now());
  }

  private get state(): DurableObjectState {
    return this.ctx as unknown as DurableObjectState;
  }

  private usageDay(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private reserveDailyTokens(actorId: string, tokens: number): boolean {
    const usageDay = this.usageDay();
    const current = [...this.state.storage.sql.exec<{ total_tokens: number }>(
      "SELECT total_tokens FROM daily_token_usage WHERE actor_id = ? AND usage_day = ?",
      actorId, usageDay,
    )][0]?.total_tokens ?? 0;
    if (current + tokens > this.dailyTokenBudget) return false;
    this.state.storage.sql.exec(
      `INSERT INTO daily_token_usage (actor_id, usage_day, total_tokens) VALUES (?, ?, ?)
       ON CONFLICT (actor_id, usage_day) DO UPDATE SET total_tokens = total_tokens + excluded.total_tokens`,
      actorId, usageDay, tokens,
    );
    return true;
  }

  private consumeRateLimit(actorId: string): boolean {
    const windowStartedAt = Math.floor(Date.now() / RATE_LIMIT_WINDOW_MS) * RATE_LIMIT_WINDOW_MS;
    const current = [...this.state.storage.sql.exec<{ window_started_at: number; request_count: number }>(
      "SELECT window_started_at, request_count FROM agent_rate_limits WHERE actor_id = ?",
      actorId,
    )][0];
    if (current && current.window_started_at === windowStartedAt && current.request_count >= this.rateLimitMaxRequests) return false;
    const nextCount = current && current.window_started_at === windowStartedAt ? current.request_count + 1 : 1;
    this.state.storage.sql.exec(
      `INSERT INTO agent_rate_limits (actor_id, window_started_at, request_count) VALUES (?, ?, ?)
       ON CONFLICT (actor_id) DO UPDATE SET window_started_at = excluded.window_started_at, request_count = excluded.request_count`,
      actorId, windowStartedAt, nextCount,
    );
    return true;
  }

  private purgeExpiredData(now = Date.now()): void {
    const cutoff = new Date(now - RETENTION_MS).toISOString();
    this.state.storage.sql.exec(
      "DELETE FROM turn_events WHERE created_at < ? AND turn_id NOT IN (SELECT id FROM turn_queue WHERE status IN ('queued', 'running'))",
      cutoff,
    );
    this.state.storage.sql.exec(
      "DELETE FROM token_usage WHERE updated_at < ? AND turn_id NOT IN (SELECT id FROM turn_queue WHERE status IN ('queued', 'running'))",
      cutoff,
    );
    this.state.storage.sql.exec(
      "DELETE FROM agent_actions WHERE created_at < ? AND NOT EXISTS (SELECT 1 FROM turn_queue WHERE status IN ('queued', 'running') AND (agent_actions.id = turn_queue.id OR agent_actions.id = turn_queue.id || ':assistant'))",
      cutoff,
    );
    this.state.storage.sql.exec(
      "DELETE FROM messages WHERE created_at < ? AND NOT EXISTS (SELECT 1 FROM turn_queue WHERE status IN ('queued', 'running') AND (messages.id = turn_queue.id OR messages.id = turn_queue.id || ':assistant'))",
      cutoff,
    );
    this.state.storage.sql.exec(
      "DELETE FROM turn_queue WHERE updated_at < ? AND status IN ('completed', 'failed', 'aborted')",
      cutoff,
    );
    this.state.storage.sql.exec("DELETE FROM access_log WHERE created_at < ?", cutoff);
  }

  private scheduleQueueDrain(): void {
    const remaining = [...this.state.storage.sql.exec<{ count: number }>("SELECT COUNT(*) AS count FROM turn_queue WHERE status = 'queued'")][0]?.count ?? 0;
    const nextAlarm = remaining > 0 ? Date.now() + 1_000 : Date.now() + RETENTION_ALARM_MS;
    this.state.storage.setAlarm?.(nextAlarm);
  }

  async alarm(): Promise<void> {
    this.purgeExpiredData();
    const queued = [...this.state.storage.sql.exec<TurnRow>(
      "SELECT id, intention_id, status, actor_id, attempts, token_budget, tokens_used, input_json FROM turn_queue WHERE status = 'queued' ORDER BY created_at ASC",
    )];
    for (const turn of queued) await this.processTurn(turn.id, turn.actor_id);
    this.scheduleQueueDrain();
  }

  async fetch(request: Request): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (path === "/health") return Response.json({ status: "ready", schemaVersion: WORKSPACE_AGENT_SCHEMA_VERSION });

    const actorId = request.headers.get("x-agent-actor");
    if (!actorId) return Response.json({ code: "agent.actor_required" }, { status: 401 });
    const historyRole = request.headers.get("x-agent-role") === "owner" ? "owner" : "member";
    if (path === "/history/export" && request.method === "GET") return this.exportHistory(actorId);
    if (path === "/history" && request.method === "DELETE") return this.deleteHistory(actorId);
    if (path === "/history/access-log" && request.method === "GET") return this.readAccessLog(actorId, historyRole);
    if (path.includes("/message/stream/")) return this.streamTurn(path.split("/message/stream/")[1]!, actorId, request);
    if (path.includes("/message/") && path.endsWith("/abort")) return this.abortTurn(path.split("/message/")[1]!.replace(/\/abort$/, ""), actorId);
    if (path.includes("/message/") && path.endsWith("/process")) return this.processTurn(path.split("/message/")[1]!.replace(/\/process$/, ""), actorId);
    if (path.includes("/message/") && path.endsWith("/retry")) return this.retryTurn(path.split("/message/")[1]!.replace(/\/retry$/, ""), actorId);
    if (!path.endsWith("/message")) return Response.json({ code: "agent.not_found" }, { status: 404 });
    if (request.method === "GET") return this.readHistory();
    if (request.method !== "POST") return Response.json({ code: "agent.method_not_allowed" }, { status: 405 });

    let body: { content?: unknown };
    try {
      body = await request.json() as { content?: unknown };
    } catch {
      return Response.json({ code: "agent.invalid_message" }, { status: 400 });
    }
    if (typeof body.content !== "string" || body.content.trim() === "") {
      return Response.json({ code: "agent.invalid_message" }, { status: 400 });
    }
    const content = redactTranscript(body.content.trim());
    const inputTokens = estimateTokens(content);
    if (inputTokens > MAX_TURN_TOKENS) return Response.json({ code: "agent.token_budget_exceeded", budget: MAX_TURN_TOKENS }, { status: 413 });
    if (!this.consumeRateLimit(actorId)) return Response.json({ code: "agent.rate_limit_exceeded", windowMs: RATE_LIMIT_WINDOW_MS }, { status: 429 });
    if (!this.reserveDailyTokens(actorId, inputTokens)) return Response.json({ code: "agent.daily_token_budget_exceeded", budget: this.dailyTokenBudget }, { status: 429 });

    const workspaceId = request.headers.get('x-agent-workspace') ?? 'unknown';
    const actorRole = request.headers.get('x-agent-role');
    const role: DelegatedRole = actorRole === 'owner' ? 'owner' : 'member';
    const capabilities = (request.headers.get('x-agent-capabilities') ?? DEFAULT_TURN_CAPABILITIES.join(','))
      .split(',').map((capability) => capability.trim()).filter(Boolean);
    const message = {
      id: crypto.randomUUID(),
      intentionId: crypto.randomUUID(),
      actorId,
      role: "user",
      content,
    };
    this.state.storage.sql.exec(
      "INSERT INTO agent_actions (id, actor_id, action_type, payload_json) VALUES (?, ?, ?, ?)",
      message.id,
      message.actorId,
      "message.created",
      JSON.stringify({ turnId: message.id, intentionId: message.intentionId, contentLength: message.content.length, inputTokens }),
    );
    this.state.storage.sql.exec(
      "INSERT INTO messages (id, actor_id, role, content_json) VALUES (?, ?, ?, ?)",
      message.id,
      message.actorId,
      message.role,
      JSON.stringify(message.content),
    );
    this.state.storage.sql.exec(
      "INSERT INTO turn_queue (id, intention_id, actor_id, input_json, status, attempts, token_budget, tokens_used) VALUES (?, ?, ?, ?, 'queued', 0, ?, ?)",
      message.id,
      message.intentionId,
      message.actorId,
      JSON.stringify({ messageId: message.id, intentionId: message.intentionId, content: message.content, role, capabilities, workspaceId }),
      MAX_TURN_TOKENS,
      inputTokens,
    );
    this.state.storage.sql.exec(
      "INSERT INTO token_usage (turn_id, input_tokens, output_tokens, total_tokens) VALUES (?, ?, 0, ?)",
      message.id, inputTokens, inputTokens,
    );
    this.appendEvent(message.id, "queued", { attempts: 0, tokenBudget: MAX_TURN_TOKENS, tokensUsed: inputTokens });
    this.state.storage.setAlarm?.(Date.now());
    return Response.json({ turnId: message.id, intentionId: message.intentionId, status: "queued", tokenBudget: MAX_TURN_TOKENS, tokensUsed: inputTokens }, { status: 202 });
  }

  private ownedTurns(actorId: string): TurnRow[] {
    return [...this.state.storage.sql.exec<TurnRow>(
      "SELECT id, intention_id, status, actor_id, attempts, token_budget, tokens_used, input_json, output_json FROM turn_queue WHERE actor_id = ? ORDER BY created_at ASC",
      actorId,
    )];
  }

  private allMessages(): MessageRow[] {
    return [...this.state.storage.sql.exec<MessageRow>(
      "SELECT id, actor_id, role, content_json, created_at FROM messages ORDER BY created_at ASC",
    )];
  }

  private allActions(): ActionRow[] {
    return [...this.state.storage.sql.exec<ActionRow>(
      "SELECT id, actor_id, action_type, payload_json, created_at FROM agent_actions ORDER BY created_at ASC",
    )];
  }

  private allEvents(): TurnEvent[] {
    return [...this.state.storage.sql.exec<TurnEvent>(
      "SELECT turn_id, event_id, event_type, payload_json, created_at FROM turn_events ORDER BY turn_id, event_id",
    )];
  }

  private appendAccessLog(actorId: string, action: string, recordCount: number): void {
    this.state.storage.sql.exec(
      "INSERT INTO access_log (actor_id, action, record_count) VALUES (?, ?, ?)",
      actorId, action, recordCount,
    );
  }

  private exportHistory(actorId: string): Response {
    const turns = this.ownedTurns(actorId);
    const turnIds = new Set(turns.map((turn) => turn.id));
    const messages = this.allMessages().filter((message) => message.actor_id === actorId || turnIds.has(message.id) || (message.id.endsWith(":assistant") && turnIds.has(message.id.slice(0, -":assistant".length))));
    const actions = this.allActions().filter((action) => action.actor_id === actorId || turnIds.has(action.id) || (action.id.endsWith(":assistant") && turnIds.has(action.id.slice(0, -":assistant".length))));
    const events = this.allEvents().filter((event) => turnIds.has(event.turn_id));
    const body = {
      version: 1,
      exportedAt: new Date().toISOString(),
      turns,
      messages: messages.map((message) => ({ ...message, content_json: redactTranscriptJson(message.content_json) })),
      actions: actions.map((action) => ({ ...action, payload_json: redactTranscriptJson(action.payload_json) })),
      events: events.map((event) => ({ ...event, payload_json: redactTranscriptJson(event.payload_json) })),
    };
    this.appendAccessLog(actorId, "history_export", turns.length + messages.length + actions.length + events.length);
    return Response.json(body);
  }

  private deleteHistory(actorId: string): Response {
    const turns = this.ownedTurns(actorId);
    const turnIds = turns.map((turn) => turn.id);
    for (const turnId of turnIds) this.activeControllers.get(turnId)?.abort();
    const messages = this.allMessages().filter((message) => message.actor_id === actorId || turnIds.includes(message.id) || (message.id.endsWith(":assistant") && turnIds.includes(message.id.slice(0, -":assistant".length))));
    const actions = this.allActions().filter((action) => action.actor_id === actorId || turnIds.includes(action.id) || (action.id.endsWith(":assistant") && turnIds.includes(action.id.slice(0, -":assistant".length))));
    const events = this.allEvents().filter((event) => turnIds.includes(event.turn_id));
    const recordCount = turns.length + messages.length + actions.length + events.length;
    try {
      this.state.storage.sql.exec("BEGIN");
      if (turnIds.length > 0 || messages.length > 0 || actions.length > 0) {
        this.state.storage.sql.exec("DELETE FROM turn_events WHERE turn_id IN (SELECT id FROM turn_queue WHERE actor_id = ?)", actorId);
        this.state.storage.sql.exec("DELETE FROM token_usage WHERE turn_id IN (SELECT id FROM turn_queue WHERE actor_id = ?)", actorId);
        this.state.storage.sql.exec("DELETE FROM agent_actions WHERE actor_id = ? OR id IN (SELECT id || ':assistant' FROM turn_queue WHERE actor_id = ?)", actorId, actorId);
        this.state.storage.sql.exec("DELETE FROM messages WHERE actor_id = ? OR id IN (SELECT id || ':assistant' FROM turn_queue WHERE actor_id = ?)", actorId, actorId);
        this.state.storage.sql.exec("DELETE FROM turn_queue WHERE actor_id = ?", actorId);
      }
      this.appendAccessLog(actorId, "history_delete", recordCount);
      this.state.storage.sql.exec("COMMIT");
      return Response.json({ deleted: recordCount > 0, recordCount });
    } catch {
      this.state.storage.sql.exec("ROLLBACK");
      return Response.json({ code: "agent.history_delete_failed" }, { status: 500 });
    }
  }

  private readAccessLog(actorId: string, role: string): Response {
    const rows = role === "owner"
      ? [...this.state.storage.sql.exec<AccessLogRow>("SELECT id, actor_id, action, record_count, created_at FROM access_log ORDER BY created_at ASC")]
      : [...this.state.storage.sql.exec<AccessLogRow>("SELECT id, actor_id, action, record_count, created_at FROM access_log WHERE actor_id = ? ORDER BY created_at ASC", actorId)];
    this.appendAccessLog(actorId, "access_log_read", rows.length);
    return Response.json({ items: rows });
  }

  private readHistory(): Response {
    const rows = [...this.state.storage.sql.exec<MessageRow>(
      "SELECT id, actor_id, role, content_json, created_at FROM messages ORDER BY created_at ASC",
    )];
    const items = rows.map((row) => ({
      id: row.id,
      actorId: row.actor_id,
      role: row.role,
      content: redactTranscript(JSON.parse(row.content_json) as string),
      createdAt: row.created_at,
    }));
    return Response.json({ items });
  }

  private readTurn(turnId: string, actorId: string): TurnRow | undefined {
    const row = [...this.state.storage.sql.exec<TurnRow>(
      "SELECT id, intention_id, status, actor_id, attempts, token_budget, tokens_used, input_json, output_json FROM turn_queue WHERE id = ? AND actor_id = ?",
      turnId,
      actorId,
    )][0];
    return row;
  }

  private streamTurn(turnId: string, actorId: string, request: Request): Response {
    const turn = this.readTurn(turnId, actorId);
    if (!turn) return Response.json({ code: "agent.turn_not_found" }, { status: 404 });
    const lastEventId = Number(request.headers.get("last-event-id") ?? "0");
    const events = [...this.state.storage.sql.exec<TurnEvent>(
      "SELECT event_id, event_type, payload_json FROM turn_events WHERE turn_id = ? AND event_id > ? ORDER BY event_id ASC",
      turnId,
      Number.isFinite(lastEventId) ? lastEventId : 0,
    )];
    const body = events.map((event) => `id: ${event.event_id}\nevent: ${event.event_type}\ndata: ${redactTranscriptJson(event.payload_json)}\n\n`).join("");
    return new Response(body, { headers: { "content-type": "text/event-stream", "cache-control": "no-cache" } });
  }

  private abortTurn(turnId: string, actorId: string): Response {
    const turn = this.readTurn(turnId, actorId);
    if (!turn) return Response.json({ code: "agent.turn_not_found" }, { status: 404 });
    if (turn.status === "completed" || turn.status === "failed") return Response.json({ code: "agent.turn_final", status: turn.status }, { status: 409 });
    this.activeControllers.get(turnId)?.abort();
    this.state.storage.sql.exec("UPDATE turn_queue SET status = 'aborted', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND actor_id = ?", turnId, actorId);
    this.appendEvent(turnId, "aborted", { reason: "client" });
    return Response.json({ turnId, status: "aborted" });
  }

  private appendEvent(turnId: string, eventType: string, payload: unknown): void {
    const next = [...this.state.storage.sql.exec<{ next_event_id: number }>(
      "SELECT COALESCE(MAX(event_id), 0) + 1 AS next_event_id FROM turn_events WHERE turn_id = ?", turnId,
    )][0]?.next_event_id ?? 1;
    this.state.storage.sql.exec(
      "INSERT INTO turn_events (turn_id, event_id, event_type, payload_json) VALUES (?, ?, ?, ?)",
      turnId, next, eventType, JSON.stringify(payload),
    );
  }

  async processTurn(turnId: string, actorId: string, processor: TurnProcessor = async (input) => input.content): Promise<Response> {
    // H-02 note: the legacy queue performs NO upstream model invocation —
    // every real inference flows through the unified attempts executor
    // (executeLlmAttempts in llm/attempts.ts) on the FinanceChatAgent legs.
    // This default processor only echoes, so there are no legacy LLM
    // attempts to unify here.
    const turn = this.readTurn(turnId, actorId);
    if (!turn) return Response.json({ code: "agent.turn_not_found" }, { status: 404 });
    if (turn.status !== "queued") {
      const storedOutput = turn.output_json ? (JSON.parse(turn.output_json) as { output?: string }).output : undefined;
      const output = storedOutput ? redactTranscript(storedOutput) : undefined;
      return Response.json({ turnId, intentionId: turn.intention_id ?? turnId, status: turn.status, attempts: turn.attempts, output });
    }
    this.state.storage.sql.exec("UPDATE turn_queue SET status = 'running', attempts = attempts + 1, lease_until = datetime('now', '+60 seconds'), updated_at = CURRENT_TIMESTAMP WHERE id = ? AND actor_id = ? AND status = 'queued'", turnId, actorId);
    if (!this.delegationSecret) {
      this.state.storage.sql.exec("UPDATE turn_queue SET status = 'failed', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND actor_id = ?", turnId, actorId);
      this.appendEvent(turnId, "failed", { reason: "agent.delegation_unavailable" });
      return Response.json({ turnId, status: "failed", code: "agent.delegation_unavailable" }, { status: 503 });
    }
    const controller = new AbortController();
    this.activeControllers.set(turnId, controller);
    const nextAttempt = turn.attempts + 1;
    this.appendEvent(turnId, "running", { attempts: nextAttempt });
    try {
      const input = JSON.parse(turn.input_json ?? "{}") as { messageId: string; intentionId?: string; content: string; role?: DelegatedRole; capabilities?: string[]; workspaceId?: string };
      const intentionId = input.intentionId ?? turn.intention_id ?? turnId;
      const processorInput = { ...input, content: redactTranscript(input.content), intentionId };
      const delegatedToken = this.delegationSecret
        ? await createDelegatedTurnToken({ actorId, workspaceId: input.workspaceId ?? 'unknown', role: input.role ?? 'member', capabilities: input.capabilities ?? DEFAULT_TURN_CAPABILITIES, requestId: turnId }, this.delegationSecret)
        : undefined;
      if (controller.signal.aborted) return Response.json({ turnId, status: "aborted" });
      const rawOutput = await processor(processorInput, controller.signal, delegatedToken);
      const output = redactTranscript(rawOutput);
      if (controller.signal.aborted) return Response.json({ turnId, status: "aborted" });
      if (delegatedToken && rawOutput.includes(delegatedToken)) {
        this.state.storage.sql.exec("UPDATE turn_queue SET status = 'failed', output_json = NULL, lease_until = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND actor_id = ?", turnId, actorId);
        this.appendEvent(turnId, "failed", { reason: "agent.sensitive_output" });
        return Response.json({ turnId, status: "failed", code: "agent.sensitive_output" }, { status: 502 });
      }
      const outputTokens = estimateTokens(output);
      if (!this.reserveDailyTokens(actorId, outputTokens)) {
        const tokensUsed = (turn.tokens_used ?? estimateTokens(input.content)) + outputTokens;
        this.state.storage.sql.exec("UPDATE token_usage SET output_tokens = ?, total_tokens = ?, updated_at = CURRENT_TIMESTAMP WHERE turn_id = ?", outputTokens, tokensUsed, turnId);
        this.state.storage.sql.exec("UPDATE turn_queue SET status = 'failed', tokens_used = ?, lease_until = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND actor_id = ?", tokensUsed, turnId, actorId);
        this.appendEvent(turnId, "failed", { reason: "daily_token_budget_exceeded", tokensUsed, dailyBudget: this.dailyTokenBudget });
        return Response.json({ turnId, status: "failed", reason: "daily_token_budget_exceeded", tokensUsed, dailyBudget: this.dailyTokenBudget }, { status: 429 });
      }
      const tokensUsed = (turn.tokens_used ?? estimateTokens(input.content)) + outputTokens;
      const tokenBudget = turn.token_budget || MAX_TURN_TOKENS;
      if (tokensUsed > tokenBudget) {
        this.state.storage.sql.exec("UPDATE token_usage SET output_tokens = ?, total_tokens = ?, updated_at = CURRENT_TIMESTAMP WHERE turn_id = ?", outputTokens, tokensUsed, turnId);
        this.state.storage.sql.exec("UPDATE turn_queue SET status = 'failed', tokens_used = ?, lease_until = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND actor_id = ?", tokensUsed, turnId, actorId);
        this.appendEvent(turnId, "failed", { reason: "token_budget_exceeded", tokensUsed, tokenBudget });
        return Response.json({ turnId, status: "failed", reason: "token_budget_exceeded", tokensUsed, tokenBudget }, { status: 429 });
      }
      const assistantId = `${turnId}:assistant`;
      this.state.storage.sql.exec("INSERT INTO agent_actions (id, actor_id, action_type, payload_json) VALUES (?, ?, ?, ?)", assistantId, "agent", "assistant.created", JSON.stringify({ turnId, outputLength: output.length, outputTokens }));
      this.state.storage.sql.exec("INSERT INTO messages (id, actor_id, role, content_json) VALUES (?, ?, ?, ?)", assistantId, "agent", "assistant", JSON.stringify(output));
      this.state.storage.sql.exec("UPDATE token_usage SET output_tokens = ?, total_tokens = ?, updated_at = CURRENT_TIMESTAMP WHERE turn_id = ?", outputTokens, tokensUsed, turnId);
      this.state.storage.sql.exec("UPDATE turn_queue SET status = 'completed', output_json = ?, tokens_used = ?, lease_until = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND actor_id = ?", JSON.stringify({ output }), tokensUsed, turnId, actorId);
      this.appendEvent(turnId, "completed", { output, tokensUsed });
      this.scheduleQueueDrain();
      return Response.json({ turnId, status: "completed", output, tokensUsed });
    } catch (cause) {
      const aborted = controller.signal.aborted || (cause instanceof Error && cause.name === "AbortError");
      const status = aborted ? "aborted" : nextAttempt >= MAX_TURN_ATTEMPTS ? "failed" : "queued";
      this.state.storage.sql.exec("UPDATE turn_queue SET status = ?, lease_until = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND actor_id = ?", status, turnId, actorId);
      this.appendEvent(turnId, status, { attempts: nextAttempt });
      if (status === "queued") this.state.storage.setAlarm?.(Date.now() + 1_000);
      return Response.json({ turnId, status, attempts: nextAttempt }, { status: status === "failed" ? 500 : 200 });
    } finally {
      this.activeControllers.delete(turnId);
    }
  }

  private retryTurn(turnId: string, actorId: string): Response {
    const turn = this.readTurn(turnId, actorId);
    if (!turn) return Response.json({ code: "agent.turn_not_found" }, { status: 404 });
    if (turn.status !== "failed") return Response.json({ turnId, status: turn.status });
    if (turn.attempts >= MAX_TURN_ATTEMPTS) return Response.json({ turnId, status: "failed", code: "agent.retry_budget_exhausted", attempts: turn.attempts }, { status: 409 });
    this.state.storage.sql.exec("UPDATE token_usage SET output_tokens = 0, total_tokens = input_tokens, updated_at = CURRENT_TIMESTAMP WHERE turn_id = ?", turnId);
    this.state.storage.sql.exec("UPDATE turn_queue SET status = 'queued', tokens_used = (SELECT input_tokens FROM token_usage WHERE turn_id = ?), updated_at = CURRENT_TIMESTAMP WHERE id = ? AND actor_id = ?", turnId, turnId, actorId);
    this.appendEvent(turnId, "retry", { attempts: turn.attempts, tokensReset: true });
    this.state.storage.setAlarm?.(Date.now());
    return Response.json({ turnId, intentionId: turn.intention_id ?? turnId, status: "queued", attempts: turn.attempts });
  }

  async exportFullWorkspaceHistory(workspaceId = 'workspace'): Promise<{
    version: number;
    workspaceId: string;
    turns: Array<{ id: string; intention_id?: string; actor_id: string; status: string; attempts: number; tokens_used: number; input_json?: string; output_json?: string }>;
    messages: Array<{ id: string; actor_id: string; role: string; content_json: string; created_at: string }>;
    hasInFlightTurns: boolean;
  }> {
    const turns = [...this.state.storage.sql.exec<TurnRow>(
      "SELECT id, intention_id, status, attempts, tokens_used, input_json, output_json, actor_id FROM turn_queue ORDER BY created_at ASC",
    )];
    const messages = [...this.state.storage.sql.exec<MessageRow>(
      "SELECT id, actor_id, role, content_json, created_at FROM messages ORDER BY created_at ASC",
    )];
    const hasInFlightTurns = turns.some((t) => t.status === "queued" || t.status === "running");
    return {
      version: WORKSPACE_AGENT_SCHEMA_VERSION,
      workspaceId,
      turns,
      messages,
      hasInFlightTurns,
    };
  }

  get storage(): DurableObjectState["storage"] {
    return this.state.storage;
  }
}

export function getAgentByName(namespace: DurableObjectNamespace, workspaceId: string): DurableObjectStub {
  return namespace.get(namespace.idFromName(workspaceId));
}

export type WorkspaceAuthorization = { actorId: string; role: DelegatedRole; workspaceId: string };

export async function authorizeWorkspaceMembership(
  request: Request,
  env: { API_ORIGIN: string; AGENT_CONNECTION_TOKEN_SECRET?: string; AGENT_AUTH_SERVICE_TOKEN?: string },
  workspaceId: string,
): Promise<Response | WorkspaceAuthorization> {
  // Preferred path: short-lived connection token (JWT) issued by the API —
  // browsers cannot forward the api.synkroo.com.br session cookie cross-site
  // to the Worker, so cookie fallback below only serves same-origin clients.
  const connectionToken = request.headers.get("x-agent-connection-token")?.trim();
  if (connectionToken && env.AGENT_CONNECTION_TOKEN_SECRET) {
    const serviceToken = env.AGENT_AUTH_SERVICE_TOKEN?.trim();
    if (!serviceToken) {
      return Response.json({ code: "agent.service_token_missing", message: "AGENT_AUTH_SERVICE_TOKEN is required" }, { status: 500 });
    }
    const { resolveCanonicalHouseholdId } = await import("./auth/workspace-alias.js");
    // C-02 fail-closed: never accept the received alias when the
    // authoritative resolution cannot confirm the canonical id.
    let canonicalWorkspaceId: string;
    try {
      canonicalWorkspaceId = await resolveCanonicalHouseholdId(env.API_ORIGIN, serviceToken, workspaceId);    } catch {
      return Response.json({ code: "agent.membership_unavailable", message: "Workspace resolution unavailable" }, { status: 503 });
    }
    const { verifyAgentConnectionToken, consumeAgentToken } = await import("./auth/connection-token.js");
    try {
      const claims = await verifyAgentConnectionToken(connectionToken, env.AGENT_CONNECTION_TOKEN_SECRET, canonicalWorkspaceId);
      if (claims.workspace !== canonicalWorkspaceId) return Response.json({ code: "agent.workspace_forbidden" }, { status: 403 });
      // C-01 + M-09: consume the jti exactly once after signature,
      // membership and workspace validation, before accepting the
      // connection/turn. A 409 means the token was already used (replay).
      let consumed: boolean;
      try {
        consumed = await consumeAgentToken(env.API_ORIGIN, serviceToken, {
          jti: claims.jti,
          workspaceId: canonicalWorkspaceId,
          actorId: claims.sub,
          expiresAt: claims.exp * 1000,
        });
      } catch (consumeErr) {
        // M-09: the authority refused consumption because the membership was
        // revoked after mint — deny as forbidden, not as a generic outage.
        const status = (consumeErr as { status?: number })?.status;
        if (status === 401 || status === 403) {
          return Response.json({ code: "agent.workspace_forbidden", message: "Access to workspace forbidden" }, { status: 403 });
        }
        return Response.json({ code: "agent.membership_unavailable", message: "Token consumption unavailable" }, { status: 503 });
      }
      if (!consumed) {
        return Response.json({ code: "agent.token_replayed", message: "Connection token already consumed" }, { status: 401 });
      }
      const role = claims.role === "owner" ? "owner" as DelegatedRole : "member" as DelegatedRole;
      return { actorId: claims.sub, role, workspaceId: canonicalWorkspaceId };
    } catch (err) {
      // Preserve the explicit replay signal when it surfaces as an error.
      if ((err as Error)?.message?.includes("token_replayed")) {
        return Response.json({ code: "agent.token_replayed", message: "Connection token already consumed" }, { status: 401 });
      }
      return Response.json({ code: "agent.workspace_forbidden" }, { status: 403 });
    }
  }

  const apiUrl = new URL(`/workspaces/${encodeURIComponent(workspaceId)}/members`, env.API_ORIGIN);
  const headers = new Headers();
  const cookie = request.headers.get("cookie");
  const origin = request.headers.get("origin");
  if (cookie) headers.set("cookie", cookie);
  if (origin) headers.set("origin", origin);
  const response = await fetch(apiUrl, { headers });
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      return Response.json({ code: "agent.workspace_forbidden" }, { status: response.status });
    }
    return Response.json({ code: "agent.membership_unavailable" }, { status: 503 });
  }

  const sessionResponse = await fetch(new URL("/auth/get-session", env.API_ORIGIN), { headers });
  if (!sessionResponse.ok) return Response.json({ code: "agent.session_required" }, { status: 401 });
  const session = await sessionResponse.json() as { user?: { id?: unknown } };
  const actorId = typeof session.user?.id === "string" ? session.user.id : undefined;
  if (!actorId) return Response.json({ code: "agent.session_required" }, { status: 401 });
  const membership = await response.clone().json() as { items?: Array<{ userId?: unknown; role?: unknown }> };
  const member = membership.items?.find((item) => item.userId === actorId);
  if (!member || (member.role !== 'owner' && member.role !== 'member')) return Response.json({ code: "agent.workspace_forbidden" }, { status: 403 });
  // C-05: the cookie fallback also names the DO by canonical id whenever the
  // authority is reachable (service token configured). Unresolvable alias →
  // deny (503). Without a service token the id stays unresolved (legacy
  // degraded path, documented in docs/ops/do-canonical-namespace.md).
  const serviceToken = env.AGENT_AUTH_SERVICE_TOKEN?.trim();
  if (serviceToken) {
    try {
      const { requireCanonicalWorkspaceId } = await import("./auth/workspace-alias.js");
      const { canonical } = await requireCanonicalWorkspaceId(env.API_ORIGIN, serviceToken, workspaceId);
      return { actorId, role: member.role, workspaceId: canonical };
    } catch {
      return Response.json({ code: "agent.membership_unavailable", message: "Workspace resolution unavailable" }, { status: 503 });
    }
  }
  return { actorId, role: member.role, workspaceId };
}

const worker = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/health/agent") {
      return Response.json({ status: "ready", binding: "AGENT" });
    }
    const match = url.pathname.match(/^\/agents\/workspace\/([^/]+)(?:\/message(?:\/stream\/[^/]+|\/[^/]+\/(?:abort|process|retry))?|\/history(?:\/export|\/access-log)?)?$/);
    if (match) {
      const workspaceId = decodeURIComponent(match[1]!);
      const authorization = await authorizeWorkspaceMembership(request, env, workspaceId);
      if (authorization instanceof Response) return authorization;
      const headers = new Headers(request.headers);
      headers.set("x-agent-actor", authorization.actorId);
      headers.set("x-agent-role", authorization.role);
      headers.set("x-agent-workspace", authorization.workspaceId);
      headers.set("x-agent-capabilities", "financial.read,financial.write");
      // C-05: the DO is ALWAYS named by the authorized canonical id, never
      // by the raw path id (which may be an alias).
      return getAgentByName(env.AGENT, authorization.workspaceId).fetch(new Request(request, { headers }));
    }
    return new Response("Not found", { status: 404 });
  },
};

export default worker;
