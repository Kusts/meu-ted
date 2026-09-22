import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { fetchSession } from "../auth";

/**
 * V4.1 Closure (SPEC AUTH-04, INV-05, Plano Phase 1 — RED).
 *
 * A sonda de sessão precisa distinguir 2xx / 401+403 / unreachable
 * (`auth.ts:74-87` hoje colapsa tudo em `{ user: null }`). Estes testes
 * exigem o sinal `status` ao lado de `user` (compat: `user` continua
 * presente para os chamadores atuais).
 */

function mockFetchOnce(response: Response | Error): void {
  if (response instanceof Error) {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(response);
  } else {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(response);
  }
}

const sessionUser = { id: "u1", email: "walis@example.com", name: "W" };

beforeEach(() => {
  localStorage.clear();
  vi.stubEnv("NEXT_PUBLIC_PI_FINANCE_API_BASE_URL", "http://localhost:3333");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("fetchSession probe (AUTH-04: 2xx vs 401/403 vs unreachable)", () => {
  it("2xx com user → authenticated", async () => {
    mockFetchOnce(
      new Response(JSON.stringify({ user: sessionUser }), { status: 200 }),
    );
    const res = await fetchSession();
    expect(res.user).toEqual(sessionUser);
    expect(res.status).toBe("authenticated");
  });

  it("2xx sem user → unauthenticated (servidor respondeu: sem sessão)", async () => {
    mockFetchOnce(new Response(JSON.stringify({ user: null }), { status: 200 }));
    const res = await fetchSession();
    expect(res.user).toBeNull();
    expect(res.status).toBe("unauthenticated");
  });

  it("401 → unauthenticated (nunca unreachable)", async () => {
    mockFetchOnce(
      new Response(JSON.stringify({ code: "auth.invalid_token" }), { status: 401 }),
    );
    const res = await fetchSession();
    expect(res.user).toBeNull();
    expect(res.status).toBe("unauthenticated");
  });

  it("403 → unauthenticated (revogação: purge+login, nunca offline)", async () => {
    mockFetchOnce(
      new Response(JSON.stringify({ code: "workspace.forbidden" }), { status: 403 }),
    );
    const res = await fetchSession();
    expect(res.user).toBeNull();
    expect(res.status).toBe("unauthenticated");
  });

  it("falha de rede → unreachable (nunca vira logout)", async () => {
    mockFetchOnce(new Error("network down"));
    const res = await fetchSession();
    expect(res.user).toBeNull();
    expect(res.status).toBe("unreachable");
  });

  it("5xx → unreachable (falha do servidor, não da sessão)", async () => {
    mockFetchOnce(new Response(JSON.stringify({}), { status: 503 }));
    const res = await fetchSession();
    expect(res.user).toBeNull();
    expect(res.status).toBe("unreachable");
  });
});
