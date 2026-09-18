import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: vi.fn(),
}));

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { EXPECTED_AGENT_ORIGIN, PRODUCTION_PWA_ORIGIN } from "@/proxy-utils";
import { GET, POST } from "./route";
import { resolveAgentOrigin } from "@/proxy-utils";

describe("Agent Next.js Proxy Route (/api/agent/[...path])", () => {
  beforeEach(() => {
    // Default: no Cloudflare runtime context (local dev/test) — the route
    // falls back to process.env, mirroring pwa-control/route.test.ts.
    vi.mocked(getCloudflareContext).mockRejectedValue(new Error("no ctx"));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.mocked(getCloudflareContext).mockRejectedValue(new Error("no ctx"));
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

  it("spoofs local origin (localhost and 127.0.0.1) to production PWA host with the explicit dev flag", async () => {
    vi.stubEnv("ALLOW_LOCAL_ORIGIN", "1");
    try {
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
      expect(capturedUpstreamRequest!.headers.get("origin")).toBe(PRODUCTION_PWA_ORIGIN);

      // 2. 127.0.0.1 origin
      const req127 = new Request("http://127.0.0.1:3000/api/agent/agents/finance-chat-agent/ws-1/rpc/history", {
        method: "GET",
        headers: { origin: "http://127.0.0.1:3000" },
      });
      await GET(req127, context);
      expect(capturedUpstreamRequest!.headers.get("origin")).toBe(PRODUCTION_PWA_ORIGIN);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("forwards localhost origin unspoofed without the explicit dev flag (fail-closed)", async () => {
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
      headers: { origin: "http://localhost:3000" },
    });
    const res = await GET(req, {
      params: Promise.resolve({
        path: ["agents", "finance-chat-agent", "ws-1", "rpc", "history"],
      }),
    });
    expect(res.status).toBe(200);
    expect(capturedUpstreamRequest!.headers.get("origin")).toBe("http://localhost:3000");
  });

  it("rejects localhost origin for state-changing requests in production even with the flag", async () => {
    vi.stubEnv("ALLOW_LOCAL_ORIGIN", "1");
    vi.stubEnv("NODE_ENV", "production");
    // Origin-gating path needs a pinned upstream (otherwise the
    // production fail-closed 500 answers first — covered below).
    vi.stubEnv("PWA_AGENT_PROXY_ORIGIN", EXPECTED_AGENT_ORIGIN);
    try {
      const fetchMock = vi.spyOn(globalThis, "fetch");
      const response = await POST(new Request("https://pwa.example/api/agent/turn", {
        method: "POST", headers: { origin: "http://localhost:3000", "content-type": "application/json" }, body: "{}",
      }), { params: Promise.resolve({ path: ["turn"] }) });
      expect(response.status).toBe(403);
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("rejects a foreign browser origin for state-changing requests", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const response = await POST(new Request("https://pwa.example/api/agent/turn", {
      method: "POST", headers: { origin: "https://attacker.example", "content-type": "application/json" }, body: "{}",
    }), { params: Promise.resolve({ path: ["turn"] }) });
    expect(response.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("marks agent responses as non-cacheable", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const response = await GET(new Request("https://pwa.example/api/agent/history"), { params: Promise.resolve({ path: ["history"] }) });
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("canonical same-origin POST forwards cookie + connection token and stays no-store (ADR-011)", async () => {
    let capturedUpstreamRequest: Request | null = null;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      capturedUpstreamRequest = new Request(input as string, init);
      return new Response(JSON.stringify({ turnId: "t1", status: "completed" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    const req = new Request("https://pwa.example/api/agent/agents/finance-chat-agent/ws-1/rpc/chat", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: "better-auth.session_token=abc",
        "x-agent-connection-token": "conn-1",
        "x-workspace-id": "ws-1",
        origin: "https://pwa.example",
      },
      body: JSON.stringify({ text: "oi" }),
    });

    const res = await POST(req, { params: Promise.resolve({ path: ["agents", "finance-chat-agent", "ws-1", "rpc", "chat"] }) });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(capturedUpstreamRequest!.headers.get("cookie")).toBe("better-auth.session_token=abc");
    expect(capturedUpstreamRequest!.headers.get("x-agent-connection-token")).toBe("conn-1");
  });
});

describe("resolveAgentOrigin (DEBT2 allowlist migration)", () => {
  it("accepts the pinned expected origin and normalizes trailing slashes", () => {
    expect(
      resolveAgentOrigin({ PWA_AGENT_PROXY_ORIGIN: `${EXPECTED_AGENT_ORIGIN}/` }),
    ).toBe(EXPECTED_AGENT_ORIGIN);
  });

  it("falls back to AGENT_ORIGIN when the primary var is blank (still pinned)", () => {
    expect(
      resolveAgentOrigin({ PWA_AGENT_PROXY_ORIGIN: "   ", AGENT_ORIGIN: EXPECTED_AGENT_ORIGIN }),
    ).toBe(EXPECTED_AGENT_ORIGIN);
  });

  it("uses the non-prod placeholder outside production when nothing is configured", () => {
    expect(resolveAgentOrigin({ NODE_ENV: "development" })).toBe("https://agent.example");
    expect(resolveAgentOrigin({})).toBe("https://agent.example");
  });

  it("fails closed in production when no upstream origin is configured", () => {
    expect(() => resolveAgentOrigin({ NODE_ENV: "production" })).toThrow(/PWA_AGENT_PROXY_ORIGIN/);
    expect(() => resolveAgentOrigin({ NODE_ENV: "production", PWA_AGENT_PROXY_ORIGIN: "   " })).toThrow();
  });

  it("rejects a non-pinned external host (non-prod placeholder, production throw)", () => {
    expect(resolveAgentOrigin({ PWA_AGENT_PROXY_ORIGIN: "https://agent.example.net" })).toBe(
      "https://agent.example",
    );
    expect(() =>
      resolveAgentOrigin({ NODE_ENV: "production", PWA_AGENT_PROXY_ORIGIN: "https://agent.example.net" }),
    ).toThrow();
  });

  it("rejects http, userinfo, path, query, fragment, and port overrides", () => {
    const bad = [
      EXPECTED_AGENT_ORIGIN.replace("https://", "http://"),
      EXPECTED_AGENT_ORIGIN.replace("https://", "https://user:pass@"),
      `${EXPECTED_AGENT_ORIGIN}/rpc/chat`,
      `${EXPECTED_AGENT_ORIGIN}?q=1`,
      `${EXPECTED_AGENT_ORIGIN}#h`,
      `${EXPECTED_AGENT_ORIGIN}:8443`,
    ];
    for (const value of bad) {
      expect(resolveAgentOrigin({ PWA_AGENT_PROXY_ORIGIN: value })).toBe("https://agent.example");
      expect(() =>
        resolveAgentOrigin({ NODE_ENV: "production", PWA_AGENT_PROXY_ORIGIN: value }),
      ).toThrow();
    }
  });
});

describe("Agent proxy upstream origin (runtime env)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    // NOTE: this describe is a sibling of the main one above, so its
    // afterEach (restoreAllMocks) does not apply here — restore locally or
    // fetch-spy call history leaks between these tests.
    vi.restoreAllMocks();
  });

  function historyContext() {
    return { params: Promise.resolve({ path: ["agents", "x", "rpc", "history"] }) };
  }

  it("proxies to the Cloudflare runtime AGENT origin when provided", async () => {
    vi.mocked(getCloudflareContext).mockReset();
    vi.mocked(getCloudflareContext).mockResolvedValue({
      env: { PWA_AGENT_PROXY_ORIGIN: EXPECTED_AGENT_ORIGIN },
    } as never);
    const seen: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      seen.push(String(input));
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });

    const res = await GET(new Request("https://pwa.example/api/agent/agents/x/rpc/history"), historyContext());
    expect(res.status).toBe(200);
    expect(seen[0]).toBe(`${EXPECTED_AGENT_ORIGIN}/agents/x/rpc/history`);
  });

  it("returns 500 without calling upstream when production has no origin configured", async () => {
    // Local/test path: no Cloudflare runtime context → process.env only.
    vi.mocked(getCloudflareContext).mockReset();
    vi.mocked(getCloudflareContext).mockRejectedValue(new Error("no ctx"));
    vi.stubEnv("NODE_ENV", "production");
    // Hermetic: no agent upstream anywhere in process.env.
    vi.stubEnv("PWA_AGENT_PROXY_ORIGIN", "");
    vi.stubEnv("AGENT_ORIGIN", "");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}"));
    try {
      const res = await GET(new Request("https://pwa.example/api/agent/agents/x/rpc/history"), historyContext());
      expect(res.status).toBe(500);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(((await res.json()) as { error: { code: string } }).error.code).toBe("upstream_misconfigured");
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
