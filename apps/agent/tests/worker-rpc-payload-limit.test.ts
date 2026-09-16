import { afterEach, describe, expect, it, vi } from "vitest";
import worker, { MAX_RPC_BODY_BYTES } from "../src/worker.js";
import { FinanceChatAgent, MAX_CHAT_ATTACHMENTS, MAX_CHAT_TEXT_CHARS } from "../src/finance-chat-agent.js";
import { createAgentConnectionToken } from "../../api/src/auth/agent-connection-token.js";

type WorkerEnv = Parameters<typeof worker.fetch>[1];

const WORKSPACE_ID = "00000000-0000-4000-8000-000000000001";
const SECRET = "secret-for-testing-purposes-at-least-32-chars!";
const PWA_ORIGIN = "https://pi-finance-pwa.walissonead.workers.dev";

// Documented ceilings (must match the exported constants in worker.ts /
// finance-chat-agent.ts): RPC bodies are small (short chat text plus
// metadata-only attachments), so 2MB / 32k chars / 10 attachments leave
// ample headroom while bounding memory per request.
const RPC_LIMIT = 2 * 1024 * 1024;
const TEXT_LIMIT = 32_000;
const ATTACH_LIMIT = 10;

const mockAuthUpstream = () => {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (info) => {
    const url = String(info);
    if (url.includes("/internal/workspace-alias/")) {
      return new Response(JSON.stringify({ canonicalHouseholdId: WORKSPACE_ID }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.includes("/internal/agent/consume-token")) {
      return new Response(JSON.stringify({ ok: true, consumed: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response("unexpected upstream", { status: 500 });
  });
};

const authedRpcRequest = async (body: string) => {
  const token = await createAgentConnectionToken(
    { sub: "user-test-1", workspace: WORKSPACE_ID, role: "owner" },
    SECRET,
  );
  return new Request(`https://agent.test.local/agents/finance-chat-agent/${WORKSPACE_ID}/rpc/chat`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-agent-connection-token": token,
      origin: PWA_ORIGIN,
    },
    body,
  });
};

const mockEnvWithDo = (doFetch: (req: Request) => Promise<Response>) =>
  ({
    FINANCE_CHAT_AGENT: {
      idFromName: vi.fn((name: string) => ({ name }) as unknown as DurableObjectId),
      get: vi.fn(() => ({ fetch: doFetch })),
    },
    API_ORIGIN: "https://api.test.local",
    AGENT_CONNECTION_TOKEN_SECRET: SECRET,
    AGENT_AUTH_SERVICE_TOKEN: "test-auth-service-token",
  }) as unknown as WorkerEnv;

const directDoAgent = () => {
  const agent = Object.create(FinanceChatAgent.prototype) as FinanceChatAgent;
  Object.defineProperty(agent, "state", {
    value: { storage: {} },
    writable: true,
    configurable: true,
  });
  Object.defineProperty(agent, "env", {
    value: { API_ORIGIN: "https://api.test.local" },
    writable: true,
    configurable: true,
  });
  return agent;
};

const doChatRequest = (body: unknown) =>
  new Request("https://agent.test.local/rpc/chat", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-agent-actor": "user-test-1",
      "x-agent-workspace": "ws-test-1",
    },
    body: JSON.stringify(body),
  });

describe("FIX-FINAL-2 FINDING 2: RPC payload limits (413 before the DO)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("exports the documented ceilings", () => {
    expect(MAX_RPC_BODY_BYTES).toBe(RPC_LIMIT);
    expect(MAX_CHAT_TEXT_CHARS).toBe(TEXT_LIMIT);
    expect(MAX_CHAT_ATTACHMENTS).toBe(ATTACH_LIMIT);
  });

  it("rejects a body above MAX_RPC_BODY_BYTES with 413 before reaching the DO", async () => {
    mockAuthUpstream();
    const doFetch = vi.fn(async (_req: Request) => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const env = mockEnvWithDo(doFetch);

    const oversized = JSON.stringify({
      text: "x".repeat(RPC_LIMIT + 1),
      intentionId: "intent-oversized-1",
    });
    const res = await worker.fetch(await authedRpcRequest(oversized), env);

    expect(res.status).toBe(413);
    expect(await res.json()).toEqual(
      expect.objectContaining({ code: "agent.payload_too_large" }),
    );
    expect(doFetch).not.toHaveBeenCalled();
  });

  it("rejects an over-ceiling stream with 413 even without Content-Length (mid-read cap)", async () => {
    mockAuthUpstream();
    const doFetch = vi.fn(async (_req: Request) => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const env = mockEnvWithDo(doFetch);

    const token = await createAgentConnectionToken(
      { sub: "user-test-1", workspace: WORKSPACE_ID, role: "owner" },
      SECRET,
    );
    // Chunked stream: no Content-Length header, so the worker must enforce
    // the ceiling DURING the read, not up front.
    const chunk = new TextEncoder().encode("y".repeat(64 * 1024));
    let emitted = 0;
    const totalChunks = Math.ceil((RPC_LIMIT + 1) / chunk.byteLength);
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (emitted >= totalChunks) {
          controller.close();
          return;
        }
        emitted += 1;
        controller.enqueue(chunk);
      },
    });
    const req = new Request(`https://agent.test.local/agents/finance-chat-agent/${WORKSPACE_ID}/rpc/chat`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-agent-connection-token": token,
        origin: PWA_ORIGIN,
      },
      body: stream,
      duplex: "half",
    } as RequestInit & { duplex: "half" });

    const res = await worker.fetch(req, env);
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual(
      expect.objectContaining({ code: "agent.payload_too_large" }),
    );
    expect(doFetch).not.toHaveBeenCalled();
  });

  it("forwards a normal-size payload to the DO", async () => {
    mockAuthUpstream();
    const doFetch = vi.fn(async (_req: Request) =>
      new Response(JSON.stringify({ status: "completed" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const env = mockEnvWithDo(doFetch);

    const res = await worker.fetch(
      await authedRpcRequest(JSON.stringify({ text: "Qual o meu saldo?", intentionId: "intent-normal-1" })),
      env,
    );

    expect(res.status).toBe(200);
    expect(doFetch).toHaveBeenCalledTimes(1);
  });

  it("rejects oversized chat text at the DO with 413", async () => {
    const agent = directDoAgent();
    const res = await agent.fetch(
      doChatRequest({ text: "x".repeat(TEXT_LIMIT + 1), intentionId: "intent-big-text-1" }),
    );
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual(
      expect.objectContaining({ code: "agent.payload_too_large" }),
    );
  });

  it("rejects too many attachments at the DO with 413", async () => {
    const agent = directDoAgent();
    const attachments = Array.from({ length: ATTACH_LIMIT + 1 }, (_, i) => ({
      type: "file",
      name: `file-${i}.pdf`,
    }));
    const res = await agent.fetch(
      doChatRequest({ text: "segue o extrato", intentionId: "intent-many-files-1", attachments }),
    );
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual(
      expect.objectContaining({ code: "agent.payload_too_large" }),
    );
  });
});
