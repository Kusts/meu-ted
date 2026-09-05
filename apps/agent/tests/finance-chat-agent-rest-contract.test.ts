import { afterEach, describe, expect, it, vi } from "vitest";
import type { UIMessage } from "agents/ai-chat-agent";
import { FinanceChatAgent } from "../src/finance-chat-agent.js";
import worker from "../src/worker.js";
import { createAgentConnectionToken } from "../../api/src/auth/agent-connection-token.js";

type WorkerEnv = Parameters<typeof worker.fetch>[1];

const createTestAgent = () => {
  const persisted: UIMessage[] = [];
  const agent = Object.create(FinanceChatAgent.prototype) as FinanceChatAgent & {
    messages: UIMessage[];
    persistMessages: (msgs: UIMessage[]) => Promise<void>;
  };
  agent.messages = persisted;

  agent.persistMessages = vi.fn(async (msgs: UIMessage[]) => {
    persisted.push(...msgs);
  });

  Object.defineProperty(agent, "state", {
    value: {
      storage: {},
    },
    writable: true,
    configurable: true,
  });

  Object.defineProperty(agent, "env", {
    value: {
      API_ORIGIN: "https://api.test.local",
      AGENT_RUNTIME_ADMIN_TOKEN: "admin-test-token",
      AGENT_CONFIG_TOKEN: "config-test-token",
    },
    writable: true,
    configurable: true,
  });

  (agent as unknown as { resolveIntentionSnapshot: () => Promise<unknown> }).resolveIntentionSnapshot = async () => ({
    intention_id: "intent-test-1",
    version: 1,
    provider_id: "opencode-zen",
    model_id: "zen-free",
    protocol: "chat-completions",
    rollout_percentage: 100,
    security_epoch: 1,
    created_at: new Date().toISOString(),
  });

  return { agent, persisted };
};

describe("FinanceChatAgent REST Contract & Shared Transcript Security", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("(1) POST /rpc/chat returns 401 when x-agent-actor or x-agent-workspace is missing", async () => {
    const { agent } = createTestAgent();

    // Missing both x-agent-actor and x-agent-workspace
    const resNoHeaders = await agent.fetch(
      new Request("https://agent.test.local/rpc/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: "Qual o meu saldo?" }),
      }),
    );
    expect(resNoHeaders.status).toBe(401);

    // Missing x-agent-workspace
    const resNoWorkspace = await agent.fetch(
      new Request("https://agent.test.local/rpc/chat", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-agent-actor": "user-123",
        },
        body: JSON.stringify({ text: "Qual o meu saldo?" }),
      }),
    );
    expect(resNoWorkspace.status).toBe(401);

    // Missing x-agent-actor
    const resNoActor = await agent.fetch(
      new Request("https://agent.test.local/rpc/chat", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-agent-workspace": "ws-123",
        },
        body: JSON.stringify({ text: "Qual o meu saldo?" }),
      }),
    );
    expect(resNoActor.status).toBe(401);
  });

  it("(2) POST /rpc/chat with trusted headers and forged body actorId persists user message with header actor metadata, followed by relay assistant message", async () => {
    const { agent, persisted } = createTestAgent();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ text: "Seu saldo atual é R$ 1.500,00." }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const trustedActor = "user-genuine-456";
    const trustedWorkspace = "ws-shared-family-789";

    const res = await agent.fetch(
      new Request("https://agent.test.local/rpc/chat", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-agent-actor": trustedActor,
          "x-agent-workspace": trustedWorkspace,
        },
        body: JSON.stringify({
          text: "Quanto gastei este mês?",
          actorId: "attacker-spoofed-999",
          metadata: { actorId: "attacker-spoofed-999" },
        }),
      }),
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { output?: string; status?: string };
    expect(body.status).toBe("completed");
    expect(body.output).toBe("Seu saldo atual é R$ 1.500,00.");

    // Contract: Must call persistMessages with user message (attributed to trusted header actor, never body) and assistant message
    expect(agent.persistMessages).toHaveBeenCalled();
    expect(persisted.length).toBeGreaterThanOrEqual(2);

    const userMessage = persisted[0]!;
    expect(userMessage.role).toBe("user");
    const userText = userMessage.parts?.[0]?.text;
    expect(userText).toBe("Quanto gastei este mês?");
    const resolvedUserActor = userMessage.metadata?.actorId;
    expect(resolvedUserActor).toBe(trustedActor);
    expect(resolvedUserActor).not.toBe("attacker-spoofed-999");

    const assistantMessage = persisted[1]!;
    expect(assistantMessage.role).toBe("assistant");
    const assistantText = assistantMessage.parts?.[0]?.text;
    expect(assistantText).toBe("Seu saldo atual é R$ 1.500,00.");
  });

  it("(3) GET /rpc/history returns persisted messages with isOwn derived by comparing authenticated actor to server metadata", async () => {
    const { agent, persisted } = createTestAgent();
    persisted.push(
      {
        id: "msg-1",
        role: "user",
        parts: [{ type: "text", text: "Mensagem enviada pelo User A" }],
        metadata: { actorId: "user-a", createdAt: "2026-08-30T10:00:00Z" },
      },
      {
        id: "msg-2",
        role: "assistant",
        parts: [{ type: "text", text: "Resposta do assistente TED para User A" }],
        metadata: { actorId: "ted", createdAt: "2026-08-30T10:00:05Z" },
      },
      {
        id: "msg-3",
        role: "user",
        parts: [{ type: "text", text: "Mensagem enviada pelo User B" }],
        metadata: { actorId: "user-b", createdAt: "2026-08-30T10:01:00Z" },
      },
    );

    const res = await agent.fetch(
      new Request("https://agent.test.local/rpc/history", {
        method: "GET",
        headers: {
          "x-agent-actor": "user-a",
          "x-agent-workspace": "ws-shared-family-789",
        },
      }),
    );

    expect(res.status).toBe(200);
    const data = (await res.json()) as { items?: Array<{ id: string; role: string; text?: string; isOwn: boolean; actorId?: string }> } | Array<{ id: string; role: string; text?: string; isOwn: boolean; actorId?: string }>;
    const items = Array.isArray(data) ? data : data.items!;
    expect(items).toHaveLength(3);

    // Message 1 from user-a viewed by user-a -> isOwn = true
    expect(items[0]!.id).toBe("msg-1");
    expect(items[0]!.isOwn).toBe(true);

    // Message 2 from assistant -> isOwn = false
    expect(items[1]!.id).toBe("msg-2");
    expect(items[1]!.isOwn).toBe(false);

    // Message 3 from user-b viewed by user-a -> isOwn = false
    expect(items[2]!.id).toBe("msg-3");
    expect(items[2]!.isOwn).toBe(false);
  });

  it("(4) GET /rpc/history disregards client-forged actorId in query or payload and enforces header identity", async () => {
    const { agent, persisted } = createTestAgent();
    persisted.push(
      {
        id: "msg-1",
        role: "user",
        parts: [{ type: "text", text: "Mensagem do User A" }],
        metadata: { actorId: "user-a", createdAt: "2026-08-30T10:00:00Z" },
      },
      {
        id: "msg-2",
        role: "user",
        parts: [{ type: "text", text: "Mensagem do User B" }],
        metadata: { actorId: "user-b", createdAt: "2026-08-30T10:01:00Z" },
      },
    );

    // Client attempts to spoof identity via query param ?actorId=user-b while authenticated as user-a
    const res = await agent.fetch(
      new Request("https://agent.test.local/rpc/history?actorId=user-b", {
        method: "GET",
        headers: {
          "x-agent-actor": "user-a",
          "x-agent-workspace": "ws-shared-family-789",
        },
      }),
    );

    expect(res.status).toBe(200);
    const data = (await res.json()) as { items?: Array<{ id: string; isOwn: boolean; actorId?: string }> } | Array<{ id: string; isOwn: boolean; actorId?: string }>;
    const items = Array.isArray(data) ? data : data.items!;

    // Server-verified actor is user-a; query parameter ?actorId=user-b must not make user-b's message isOwn = true
    const userBItem = items.find((m) => m.id === "msg-2");
    expect(userBItem?.isOwn).toBe(false);

    const userAItem = items.find((m) => m.id === "msg-1");
    expect(userAItem?.isOwn).toBe(true);

    // Unauthenticated GET /rpc/history returns 401
    const unauthRes = await agent.fetch(
      new Request("https://agent.test.local/rpc/history", {
        method: "GET",
      }),
    );
    expect(unauthRes.status).toBe(401);
  });

  it("(5) Worker routing replaces forged x-agent-actor header with authenticated token claims and rewrites URL to DO", async () => {
    const SECRET = "secret-for-testing-purposes-at-least-32-chars!";
    const WORKSPACE_ID = "00000000-0000-4000-8000-000000000001";
    const GENUINE_USER = "user-authenticated-uuid";

    const token = await createAgentConnectionToken(
      {
        sub: GENUINE_USER,
        workspace: WORKSPACE_ID,
        role: "owner",
      },
      SECRET,
    );

    let capturedDoRequest: Request | null = null;

    const mockEnv: WorkerEnv = {
      AGENT: {
        idFromName: vi.fn((name: string) => ({ name }) as unknown as DurableObjectId),
        get: vi.fn(() => ({
          exportFullWorkspaceHistory: vi.fn(async () => ({
            version: 1,
            workspaceId: WORKSPACE_ID,
            turns: [],
            messages: [],
            hasInFlightTurns: false,
          })),
          fetch: vi.fn(async () => new Response("legacy agent")),
        })),
      },
      FINANCE_CHAT_AGENT: {
        idFromName: vi.fn((name: string) => ({ name }) as unknown as DurableObjectId),
        get: vi.fn(() => ({
          importLegacyHistory: vi.fn(async () => ({ success: true, importedCount: 0, skipped: true })),
          fetch: vi.fn(async (req: Request) => {
            capturedDoRequest = req;
            return new Response(JSON.stringify({ items: [] }), {
              status: 200,
              headers: { "content-type": "application/json" },
            });
          }),
        })),
      },
      API_ORIGIN: "https://api.test.local",
      AGENT_CONNECTION_TOKEN_SECRET: SECRET,
      AGENT_AUTH_SERVICE_TOKEN: "test-auth-service-token",
    };

    // Client sends request with valid signed token, but also tries to inject forged header x-agent-actor
    const req = new Request(
      `https://agent.test.local/agents/finance-chat-agent/${WORKSPACE_ID}/rpc/history`,
      {
        method: "GET",
        headers: {
          "x-agent-connection-token": token,
          "x-agent-actor": "attacker-spoofed-id",
          "x-agent-workspace": "attacker-spoofed-workspace",
          origin: "https://pi-finance-pwa.walissonead.workers.dev",
        },
      },
    );

    const res = await worker.fetch(req, mockEnv);
    expect(res.status).toBe(200);

    // The Durable Object must have received the request with verified actor header, NOT forged header
    expect(capturedDoRequest).not.toBeNull();
    expect(capturedDoRequest!.headers.get("x-agent-actor")).toBe(GENUINE_USER);
    expect(capturedDoRequest!.headers.get("x-agent-actor")).not.toBe("attacker-spoofed-id");
    expect(capturedDoRequest!.headers.get("x-agent-workspace")).toBe(WORKSPACE_ID);

    // URL must be rewritten to /rpc/history
    const doUrl = new URL(capturedDoRequest!.url);
    expect(doUrl.pathname).toBe("/rpc/history");
  });

  it("(6) RED: redacts sensitive secrets from user input, relay prompt, persisted messages, output and error bodies", async () => {
    const { agent, persisted } = createTestAgent();
    let capturedRelayBody: { prompt?: string } = {};
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_info, init) => {
      if (init?.body) {
        capturedRelayBody = JSON.parse(init.body as string);
      }
      return new Response(JSON.stringify({ text: "Relay response containing api_key: leaked-relay-key-xyz987" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    const userPromptWithSecret = "Meu segredo é password: my-secret-pass-123 e api_key: user-secret-key-abc999";
    const res = await agent.fetch(
      new Request("https://agent.test.local/rpc/chat", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-agent-actor": "user-test-1",
          "x-agent-workspace": "ws-test-1",
        },
        body: JSON.stringify({ text: userPromptWithSecret }),
      }),
    );

    expect(res.status).toBe(200);
    const data = (await res.json()) as { output: string };

    // Output must not contain the raw relay secret
    expect(data.output).not.toContain("leaked-relay-key-xyz987");
    expect(data.output).toContain("[REDACTED]");

    // Prompt sent to relay must not contain the raw user secrets
    expect(capturedRelayBody.prompt).toBeDefined();
    expect(capturedRelayBody.prompt).not.toContain("my-secret-pass-123");
    expect(capturedRelayBody.prompt).not.toContain("user-secret-key-abc999");
    expect(capturedRelayBody.prompt).toContain("[REDACTED]");

    // Persisted messages must not contain user or assistant secrets
    expect(persisted.length).toBeGreaterThanOrEqual(2);
    const userMsg = persisted[0]!;
    const userContent = userMsg.parts?.[0]?.text ?? "";
    expect(userContent).not.toContain("my-secret-pass-123");
    expect(userContent).not.toContain("user-secret-key-abc999");
    expect(userContent).toContain("[REDACTED]");

    const asstMsg = persisted[1]!;
    const asstContent = asstMsg.parts?.[0]?.text ?? "";
    expect(asstContent).not.toContain("leaked-relay-key-xyz987");
    expect(asstContent).toContain("[REDACTED]");
  });

  it("(7) RED: non-RPC route under /agents/finance-chat-agent/:workspace with valid token returns 404 and does not reach DO/SDK", async () => {
    const SECRET = "secret-for-testing-purposes-at-least-32-chars!";
    const WORKSPACE_ID = "00000000-0000-4000-8000-000000000001";
    const GENUINE_USER = "user-authenticated-uuid";

    const token = await createAgentConnectionToken(
      {
        sub: GENUINE_USER,
        workspace: WORKSPACE_ID,
        role: "owner",
      },
      SECRET,
    );

    const mockDoFetch = vi.fn();
    const mockEnv: WorkerEnv = {
      AGENT: {
        idFromName: vi.fn((name: string) => ({ name }) as unknown as DurableObjectId),
        get: vi.fn(() => ({
          exportFullWorkspaceHistory: vi.fn(async () => ({
            version: 1,
            workspaceId: WORKSPACE_ID,
            turns: [],
            messages: [],
            hasInFlightTurns: false,
          })),
          fetch: vi.fn(async () => new Response("legacy agent")),
        })),
      },
      FINANCE_CHAT_AGENT: {
        idFromName: vi.fn((name: string) => ({ name }) as unknown as DurableObjectId),
        get: vi.fn(() => ({
          importLegacyHistory: vi.fn(async () => ({ success: true, importedCount: 0, skipped: true })),
          fetch: mockDoFetch,
        })),
      },
      API_ORIGIN: "https://api.test.local",
      AGENT_CONNECTION_TOKEN_SECRET: SECRET,
      AGENT_AUTH_SERVICE_TOKEN: "test-auth-service-token",
    };

    // Non-RPC subpath, e.g. /other-action or /websocket
    const req = new Request(
      `https://agent.test.local/agents/finance-chat-agent/${WORKSPACE_ID}/other-action`,
      {
        method: "GET",
        headers: {
          "x-agent-connection-token": token,
          origin: "https://pi-finance-pwa.walissonead.workers.dev",
        },
      },
    );

    const res = await worker.fetch(req, mockEnv);
    expect(res.status).toBe(404);
    expect(mockDoFetch).not.toHaveBeenCalled();
  });

  it("(8) RED: POST /rpc/chat fails closed with 503 if persistMessages is absent, preventing unpersisted memory mutation", async () => {
    const { agent } = createTestAgent();
    // Overwrite persistMessages to undefined
    (agent as unknown as { persistMessages: unknown }).persistMessages = undefined;

    const res = await agent.fetch(
      new Request("https://agent.test.local/rpc/chat", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-agent-actor": "user-test-1",
          "x-agent-workspace": "ws-test-1",
        },
        body: JSON.stringify({ text: "Olá TED" }),
      }),
    );

    expect(res.status).toBe(503);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("agent.persistence_unavailable");
    // Ensure messages array was not mutated as fallback
    expect(agent.messages).toHaveLength(0);
  });
});
