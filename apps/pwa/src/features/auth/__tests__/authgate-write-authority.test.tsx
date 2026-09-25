import "fake-indexeddb/auto";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AuthGate } from "../AuthGate";
import {
  getSessionStatus,
  resetSessionStatus,
} from "@/lib/auth/session-authority";
import {
  getOfflinePrincipalId,
  getOfflineWorkspaceId,
  setOfflinePrincipalId,
  setOfflineWorkspaceId,
} from "@/lib/auth/offline-identity";
import {
  resolveUnreachableOfflineRoute,
  writeV3Snapshot,
} from "@/lib/state/snapshot-db";

/**
 * W1 item 2 (Onda 1) — RED: autoridade/identidade no shell PWA.
 *
 * - Shell `unknown` (device verificado + cookie recusado) falha fechado:
 *   login, sem autoridade de I/O ao device token;
 * - `signInWithEmail` + `registerDeviceToken` 2xx seguidos de probe
 *   indisponível OU 2xx-sem-usuário NÃO marcam authenticated nem criam
 *   offlinePrincipalId com o e-mail digitado (só ID validado/canônico de
 *   /auth/session);
 * - 401/403 mantém purge/login; indisponibilidade não apaga snapshot válido;
 * - reabertura offline e troca de workspace sem reatribuição de snapshot.
 */

// ─── localStorage mock (mesmo padrão dos demais testes AuthGate) ─────────────
const store: Record<string, string> = {};

const WS_UUID = "66666666-7777-4888-8999-aaaaaaaaaaaa";
const PRINCIPAL = "user-authgate-guard";

function sessionResponse(user: unknown, status = 200) {
  return new Response(JSON.stringify({ user }), { status });
}

/** Roteia fetch por URL: probe de sessão, device e auth de login. */
function mockAuthFlow(opts: {
  bootProbe: "user" | "empty" | "401" | "unreachable";
  signIn?: "ok" | "401";
  register?: "ok";
  loginProbe?: "user" | "empty" | "unreachable";
  verify?: "ok" | "401" | "403";
}) {
  const calls: string[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    calls.push(url);
    if (url.includes("/auth/devices/register")) {
      return new Response(
        JSON.stringify({ token: "new-device-token", deviceId: "d1", householdId: "h1" }),
        { status: 201 },
      );
    }
    if (url.includes("/auth/sign-in/email")) {
      if (opts.signIn === "401") {
        return new Response(JSON.stringify({ code: "auth.invalid_credentials" }), {
          status: 401,
        });
      }
      return new Response(JSON.stringify({ user: { email: "walis@example.com" } }), {
        status: 200,
      });
    }
    if (url.includes("/auth/devices/me")) {
      if (opts.verify === "401") {
        return new Response(JSON.stringify({ code: "auth.invalid_token" }), {
          status: 401,
        });
      }
      if (opts.verify === "403") {
        return new Response(JSON.stringify({ code: "auth.device_forbidden" }), {
          status: 403,
        });
      }
      return new Response(JSON.stringify({ deviceId: "d1" }), { status: 200 });
    }
    if (url.includes("/auth/session")) {
      // A primeira chamada é o probe de boot; após sign-in + register, as
      // seguintes são o probe pós-login. Distingue pela ordem.
      const sessionCalls = calls.filter((c) => c.includes("/auth/session"));
      const kind = sessionCalls.length <= 1 ? opts.bootProbe : (opts.loginProbe ?? "empty");
      if (kind === "unreachable") throw new TypeError("fetch failed");
      if (kind === "401") {
        return new Response(JSON.stringify({ code: "auth.session_required" }), {
          status: 401,
        });
      }
      if (kind === "user") {
        return sessionResponse({ id: PRINCIPAL, email: "user@example.com", name: "U" });
      }
      return sessionResponse(null);
    }
    return new Response(JSON.stringify({}), { status: 404 });
  });
}

function seedValidV3() {
  setOfflinePrincipalId(PRINCIPAL);
  setOfflineWorkspaceId(WS_UUID);
  return writeV3Snapshot(PRINCIPAL, WS_UUID, "accounts", [
    {
      id: "a1",
      name: "Conta Offline",
      kind: "checking",
      initialBalanceCents: 0,
      status: "active",
      createdAt: "2026-01-01",
      updatedAt: "2026-01-01",
      balanceCents: 100_00,
    },
  ] as never);
}

async function submitLogin(email = "walis@example.com", password = "password123!") {
  const emailInput = await screen.findByPlaceholderText(/seu\.email@exemplo\.com/, {}, { timeout: 3000 });
  fireEvent.change(emailInput, { target: { value: email } });
  fireEvent.change(screen.getByPlaceholderText(/••••••••/), {
    target: { value: password },
  });
  fireEvent.click(screen.getByRole("button", { name: /Entrar/i }));
}

beforeEach(async () => {
  Object.keys(store).forEach((k) => delete store[k]);
  vi.spyOn(window.localStorage, "getItem").mockImplementation(
    (k) => store[String(k)] ?? null,
  );
  vi.spyOn(window.localStorage, "setItem").mockImplementation((k, v) => {
    store[String(k)] = String(v);
  });
  vi.spyOn(window.localStorage, "removeItem").mockImplementation((k) => {
    delete store[String(k)];
  });
  resetSessionStatus();
  const dbs = await indexedDB.databases();
  for (const db of dbs) {
    if (db.name) indexedDB.deleteDatabase(db.name);
  }
  vi.stubEnv("NEXT_PUBLIC_PI_FINANCE_API_BASE_URL", "http://localhost:3333");
});

afterEach(() => {
  resetSessionStatus();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("AuthGate shell unknown falha fechado (W1 item 2)", () => {
  it("device verificado + cookie explicitamente recusado → login, sem unlock, sem autoridade ao device", async () => {
    store["pi-finance:token"] = "dev-verified-abc";
    mockAuthFlow({ bootProbe: "empty", verify: "ok" });

    render(
      <AuthGate>
        <div data-testid="app">App Content</div>
      </AuthGate>,
    );

    await screen.findByPlaceholderText(/seu\.email@exemplo\.com/, {}, { timeout: 3000 });
    expect(screen.queryByTestId("app")).not.toBeInTheDocument();
    // Autoridade explícita de rejeição — nunca `unknown` com shell liberado.
    expect(getSessionStatus().status).toBe("unauthenticated");
  });
});

describe("AuthGate identidade pós-login só com ID validado (W1 item 2)", () => {
  it("login validado: probe com usuário → authenticated + principal canônico + unlock", async () => {
    mockAuthFlow({ bootProbe: "empty", loginProbe: "user" });

    render(
      <AuthGate>
        <div data-testid="app">App Content</div>
      </AuthGate>,
    );
    await submitLogin();

    expect(await screen.findByTestId("app", {}, { timeout: 3000 })).toBeInTheDocument();
    expect(getSessionStatus()).toEqual({
      status: "authenticated",
      user: { userId: PRINCIPAL, email: "user@example.com", name: "U" },
    });
    expect(getOfflinePrincipalId()).toBe(PRINCIPAL);
  });

  it("login sem ID estável (probe indisponível): NÃO autentica, NÃO cria principal com e-mail, mantém login com erro", async () => {
    mockAuthFlow({ bootProbe: "empty", loginProbe: "unreachable" });

    render(
      <AuthGate>
        <div data-testid="app">App Content</div>
      </AuthGate>,
    );
    await submitLogin();

    await screen.findByRole("alert", {}, { timeout: 3000 });
    expect(screen.queryByTestId("app")).not.toBeInTheDocument();
    expect(getSessionStatus().status).not.toBe("authenticated");
    // Identidade inventada a partir do e-mail digitado é proibida.
    expect(getOfflinePrincipalId()).toBeNull();
  });

  it("login sem ID estável (2xx sem usuário): NÃO autentica nem cria principal; rejeição explícita purga identidade", async () => {
    mockAuthFlow({ bootProbe: "empty", loginProbe: "empty" });

    render(
      <AuthGate>
        <div data-testid="app">App Content</div>
      </AuthGate>,
    );
    await submitLogin();

    await screen.findByRole("alert", {}, { timeout: 3000 });
    expect(screen.queryByTestId("app")).not.toBeInTheDocument();
    expect(getSessionStatus().status).not.toBe("authenticated");
    expect(getOfflinePrincipalId()).toBeNull();
  });

  it("probe indisponível pós-login NÃO apaga snapshot válido anterior", async () => {
    // Rede instável: boot unreachable sem V3 válido → login (sem purge);
    // o snapshot/identidade (re)existe na tela de login e a tentativa de
    // login com probe indisponível não pode destruí-los.
    mockAuthFlow({ bootProbe: "unreachable", loginProbe: "unreachable" });

    render(
      <AuthGate>
        <div data-testid="app">App Content</div>
      </AuthGate>,
    );
    await screen.findByPlaceholderText(/seu\.email@exemplo\.com/, {}, { timeout: 3000 });
    await seedValidV3();
    await waitFor(async () => {
      expect(await resolveUnreachableOfflineRoute(PRINCIPAL, WS_UUID)).toBe(
        "offline-read-only",
      );
    });
    await submitLogin();
    await screen.findByRole("alert", {}, { timeout: 3000 });

    // Snapshot + identidade anteriores sobrevivem à indisponibilidade.
    expect(getOfflinePrincipalId()).toBe(PRINCIPAL);
    expect(getOfflineWorkspaceId()).toBe(WS_UUID);
    expect(await resolveUnreachableOfflineRoute(PRINCIPAL, WS_UUID)).toBe(
      "offline-read-only",
    );
  });
});

describe("AuthGate probe/device classification (FIX-PWA-AUTHGATE)", () => {
  it("probe 2xx-sem-usuário + device 403 operacional → login com purge, nunca offline (rejeição explícita)", async () => {
    // O probe respondeu explicitamente "sem sessão" e o device endpoint
    // recusou operacionalmente (403): rejeição explícita — purge de
    // identidade + snapshots e login, sem jamais consultar a rota offline
    // nem reabrir o V3 (mesmo válido).
    await seedValidV3();
    store["pi-finance:token"] = "dev-operational-403";
    mockAuthFlow({ bootProbe: "empty", verify: "403" });

    render(
      <AuthGate>
        <div data-testid="app">App Content</div>
      </AuthGate>,
    );

    await screen.findByPlaceholderText(/seu\.email@exemplo\.com/, {}, { timeout: 3000 });
    expect(screen.queryByTestId("app")).not.toBeInTheDocument();
    // Rejeição explícita — nunca autoridade unreachable/offline.
    expect(getSessionStatus().status).toBe("unauthenticated");
    // Purge: identidade offline descartada apesar do V3 válido anterior.
    expect(getOfflinePrincipalId()).toBeNull();
    expect(await resolveUnreachableOfflineRoute(PRINCIPAL, WS_UUID)).not.toBe(
      "offline-read-only",
    );
  });

  it("probe unreachable + device 401 → descarta só o device token, preserva identidade/snapshot e abre V3 read-only", async () => {
    // O probe nunca alcançou o servidor (indisponibilidade, não rejeição)
    // e o device token está expirado (401): só o device token cai — a
    // identidade offline e o snapshot sobrevivem e o V3 válido destrava
    // read-only, sem apagar sessão/snapshot.
    await seedValidV3();
    store["pi-finance:token"] = "dev-expired-unreachable";
    mockAuthFlow({ bootProbe: "unreachable", verify: "401" });

    render(
      <AuthGate>
        <div data-testid="app">App Content</div>
      </AuthGate>,
    );

    expect(await screen.findByTestId("app", {}, { timeout: 3000 })).toBeInTheDocument();
    // Indisponibilidade — nunca rejeição explícita.
    expect(getSessionStatus().status).toBe("unreachable");
    // Só o device token foi descartado…
    expect(store["pi-finance:token"]).toBeUndefined();
    // …identidade e snapshot offline preservados, V3 válido abre read-only.
    expect(getOfflinePrincipalId()).toBe(PRINCIPAL);
    expect(getOfflineWorkspaceId()).toBe(WS_UUID);
    expect(await resolveUnreachableOfflineRoute(PRINCIPAL, WS_UUID)).toBe(
      "offline-read-only",
    );
  });
});

describe("AuthGate reabertura offline e troca de workspace (W1 item 2)", () => {  it("reabertura offline: V3 válido + probe unreachable → unlock com autoridade unreachable (nunca authenticated)", async () => {
    await seedValidV3();
    mockAuthFlow({ bootProbe: "unreachable", verify: "ok" });

    render(
      <AuthGate>
        <div data-testid="app">App Content</div>
      </AuthGate>,
    );

    expect(await screen.findByTestId("app", {}, { timeout: 3000 })).toBeInTheDocument();
    expect(getSessionStatus().status).toBe("unreachable");
  });

  it("troca de workspace sem snapshot do destino NÃO reatribui snapshot de outro workspace", async () => {
    await seedValidV3();
    const OTHER_WS = "77777777-8888-4999-8999-bbbbbbbbbbbb";
    // Choke point de troca: o binding passa a Y, sem snapshot de Y.
    setOfflineWorkspaceId(OTHER_WS);

    expect(await resolveUnreachableOfflineRoute(PRINCIPAL, OTHER_WS)).toBe("login");
    // O snapshot de X continua particionado em X — nunca servido como Y.
    expect(await resolveUnreachableOfflineRoute(PRINCIPAL, WS_UUID)).toBe(
      "offline-read-only",
    );
  });
});
