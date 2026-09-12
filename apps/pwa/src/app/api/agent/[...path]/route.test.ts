import { afterEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "./route";

describe("Agent Next.js Proxy Route (/api/agent/[...path])", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("forwards allowed token headers and strips forged x-agent-actor or x-agent-role headers", async () => {
    let capturedUpstreamRequest: Request | null = null;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      capturedUpstreamRequest = new Request(input as string, init);
      return new Response(JSON.stringify({ status: "ok" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    const req = new Request("http://localhost:3000/api/agent/agents/finance-chat-agent/ws-1/rpc/history", {
      method: "GET",
      headers: {
        "x-agent-connection-token": "valid-user-token",
        "x-workspace-id": "ws-1",
        "x-agent-actor": "attacker-forged-actor",
        "x-agent-role": "attacker-forged-role",
        authorization: "Bearer session-token",
      },
    });

    const context = {
      params: Promise.resolve({
        path: ["agents", "finance-chat-agent", "ws-1", "rpc", "history"],
      }),
    };

    const res = await GET(req, context);
    expect(res.status).toBe(200);

    expect(capturedUpstreamRequest).not.toBeNull();
    const headers = capturedUpstreamRequest!.headers;

    // Allowed headers are forwarded
    expect(headers.get("x-agent-connection-token")).toBe("valid-user-token");
    expect(headers.get("x-workspace-id")).toBe("ws-1");
    expect(headers.get("authorization")).toBe("Bearer session-token");

    // Forged identity headers are stripped
    expect(headers.get("x-agent-actor")).toBeNull();
    expect(headers.get("x-agent-role")).toBeNull();
  });

  it("proxies POST payload to upstream agent route", async () => {
    let capturedBody: string | null = null;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      if (init?.body) {
        capturedBody = new TextDecoder().decode(init.body as ArrayBuffer);
      }
      return new Response(JSON.stringify({ turnId: "turn-123", status: "completed" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    const req = new Request("http://localhost:3000/api/agent/agents/finance-chat-agent/ws-1/rpc/chat", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-agent-connection-token": "valid-user-token",
      },
      body: JSON.stringify({ text: "Qual o meu saldo?" }),
    });

    const context = {
      params: Promise.resolve({
        path: ["agents", "finance-chat-agent", "ws-1", "rpc", "chat"],
      }),
    };

    const res = await POST(req, context);
    expect(res.status).toBe(200);
    expect(capturedBody).toBe(JSON.stringify({ text: "Qual o meu saldo?" }));
  });

  it("spoofs local origin (localhost and 127.0.0.1) to production PWA host", async () => {
    let capturedUpstreamRequest: Request | null = null;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      capturedUpstreamRequest = new Request(input as string, init);
      return new Response(JSON.stringify({ status: "ok" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    const context = {
      params: Promise.resolve({
        path: ["agents", "finance-chat-agent", "ws-1", "rpc", "history"],
      }),
    };

    // 1. localhost origin
    const reqLocalhost = new Request("http://localhost:3000/api/agent/agents/finance-chat-agent/ws-1/rpc/history", {
      method: "GET",
      headers: { origin: "http://localhost:3000" },
    });
    await GET(reqLocalhost, context);
    expect(capturedUpstreamRequest!.headers.get("origin")).toBe("https://pi-finance-pwa.walissonead.workers.dev");

    // 2. 127.0.0.1 origin
    const req127 = new Request("http://127.0.0.1:3000/api/agent/agents/finance-chat-agent/ws-1/rpc/history", {
      method: "GET",
      headers: { origin: "http://127.0.0.1:3000" },
    });
    await GET(req127, context);
    expect(capturedUpstreamRequest!.headers.get("origin")).toBe("https://pi-finance-pwa.walissonead.workers.dev");
  });
});

