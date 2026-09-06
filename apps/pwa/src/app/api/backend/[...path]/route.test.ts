import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

describe("same-origin backend proxy", () => {
  afterEach(() => vi.restoreAllMocks());

  it("forwards the auth cookie and preserves upstream Set-Cookie", async () => {
    const upstream = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ session: true }), {
        status: 200,
        headers: {
          "content-type": "application/json",
          "set-cookie": "better-auth.session_token=opaque; Path=/; HttpOnly; Secure; SameSite=Lax",
        },
      }),
    );

    const request = new Request("https://pwa.example/api/backend/auth/sign-in/email", {
      method: "POST",
      headers: {
        cookie: "better-auth.session_token=old",
        origin: "https://pwa.example",
        "content-type": "application/json",
      },
      body: JSON.stringify({ email: "user@example.com", password: "secret" }),
    });

    const response = await POST(request, { params: Promise.resolve({ path: ["auth", "sign-in", "email"] }) });
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("better-auth.session_token=opaque");
    expect(await response.json()).toEqual({ session: true });
    expect(upstream).toHaveBeenCalledWith(
      "https://api.synkroo.com.br/auth/sign-in/email",
      expect.objectContaining({ method: "POST", body: expect.any(ArrayBuffer), headers: expect.any(Headers) }),
    );
    const [, init] = upstream.mock.calls[0] ?? [];
    expect(new TextDecoder().decode(init?.body as ArrayBuffer)).toBe(JSON.stringify({ email: "user@example.com", password: "secret" }));
    const headers = init?.headers as Headers;
    expect(headers.get("cookie")).toBe("better-auth.session_token=old");
    expect(headers.get("origin")).toBe("https://pwa.example");
  });

  it("rewrites localhost origin to the trusted production PWA origin", async () => {
    const upstream = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const request = new Request("http://localhost:3000/api/backend/auth/sign-in/email", {
      method: "POST",
      headers: {
        origin: "http://localhost:3000",
        "content-type": "application/json",
      },
      body: JSON.stringify({ email: "user@example.com", password: "secret" }),
    });

    await POST(request, { params: Promise.resolve({ path: ["auth", "sign-in", "email"] }) });

    const [, init] = upstream.mock.calls[0] ?? [];
    const headers = init?.headers as Headers;
    expect(headers.get("origin")).toBe("https://pi-finance-pwa.walissonead.workers.dev");
  });
});

/**
 * T4 — cobre o override de dev do proxy (commit 6e27e43): sem
 * PWA_BACKEND_PROXY_ORIGIN o destino é a API de produção; com a env, o
 * proxy espelha para a origem local sem tocar os paths de produção.
 *
 * API_ORIGIN é lida no topo do módulo, então cada caso reimporta a rota
 * com o env stubado (vi.resetModules + import dinâmico).
 */

const PRODUCTION_ORIGIN = "https://api.synkroo.com.br";

function mockUpstream(status = 200, body: unknown = { ok: true }) {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function loadRoute() {
  vi.resetModules();
  return await import("./route");
}

function context(path: string[]) {
  return { params: Promise.resolve({ path }) };
}

describe("backend proxy origin (T4)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("usa a API de produção por padrão (sem env)", async () => {
    vi.stubEnv("PWA_BACKEND_PROXY_ORIGIN", "");
    const fetchMock = mockUpstream();
    const { GET } = await loadRoute();

    const res = await GET(
      new Request("http://localhost:3000/api/backend/health"),
      context(["health"]),
    );

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe(`${PRODUCTION_ORIGIN}/health`);
  });

  it("usa a API de produção quando a env é só espaços", async () => {
    vi.stubEnv("PWA_BACKEND_PROXY_ORIGIN", "   ");
    const fetchMock = mockUpstream();
    const { GET } = await loadRoute();

    await GET(
      new Request("http://localhost:3000/api/backend/health"),
      context(["health"]),
    );

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe(`${PRODUCTION_ORIGIN}/health`);
  });

  it("espelha para a origem local via PWA_BACKEND_PROXY_ORIGIN", async () => {
    vi.stubEnv("PWA_BACKEND_PROXY_ORIGIN", "http://127.0.0.1:3001");
    const fetchMock = mockUpstream();
    const { GET } = await loadRoute();

    await GET(
      new Request("http://localhost:3000/api/backend/v1/payables?status=pending"),
      context(["v1", "payables"]),
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://127.0.0.1:3001/v1/payables?status=pending");
    expect(init.method).toBe("GET");
  });

  it("remove espaços da env antes de usar", async () => {
    vi.stubEnv("PWA_BACKEND_PROXY_ORIGIN", "  http://127.0.0.1:3001  ");
    const fetchMock = mockUpstream();
    const { POST: postRoute } = await loadRoute();

    await postRoute(
      new Request("http://localhost:3000/api/backend/v1/transfer", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ amountCents: 100 }),
      }),
      context(["v1", "transfer"]),
    );

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe("http://127.0.0.1:3001/v1/transfer");
  });

  it("codifica segmentos do path no upstream", async () => {
    vi.stubEnv("PWA_BACKEND_PROXY_ORIGIN", "");
    const fetchMock = mockUpstream();
    const { GET } = await loadRoute();

    await GET(
      new Request("http://localhost:3000/api/backend/v1/search"),
      context(["v1", "a b/c"]),
    );

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe(`${PRODUCTION_ORIGIN}/v1/a%20b%2Fc`);
  });
});
