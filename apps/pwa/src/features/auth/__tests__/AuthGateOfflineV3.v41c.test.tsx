import "fake-indexeddb/auto";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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
 * V41C-FIX-PWA-P1 FIX 2 + FIX 4 (P1, INV-05/AUTH-T03..T05) — RED.
 *
 * FIX 2: with a device token stored and the session probe `unreachable`,
 * AuthGate must ALWAYS validate the V3 snapshot route (owner + TTL) before
 * unlocking — otherwise it stays on the offline/login screen. Unlock on
 * unreachable is offline read-only only, never live bootstrap.
 *
 * FIX 4: with no device token and the probe answering 401/403
 * (`unauthenticated`), AuthGate must purge offline identity + V3 snapshot
 * (clearSensitiveSession) BEFORE publishing login — otherwise a later
 * network unavailability reopens financial data from the snapshot (INV-05).
 */

// ─── localStorage mock (same pattern as AuthGate.test.tsx) ──────────────────
const store: Record<string, string> = {};

const WS_UUID = "66666666-7777-4888-8999-aaaaaaaaaaaa";
const PRINCIPAL = "user-v41c";

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

/** Route fetch by URL: probe vs scoped device verification. */
function mockProbeAndVerify(opts: {
  probe: "user" | "empty" | "401" | "unreachable";
  verify: "ok" | "unreachable";
}) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    if (url.includes("/auth/session")) {
      if (opts.probe === "unreachable") {
        throw new TypeError("fetch failed");
      }
      if (opts.probe === "401") {
        return new Response(
          JSON.stringify({ ok: false, error: { code: "auth.session_required" } }),
          { status: 401 },
        );
      }
      if (opts.probe === "user") {
        return new Response(
          JSON.stringify({
            user: { id: PRINCIPAL, email: "user@example.com", name: "U" },
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ user: null }), { status: 200 });
    }
    if (url.includes("/auth/devices/me")) {
      if (opts.verify === "unreachable") {
        throw new TypeError("fetch failed");
      }
      return new Response(JSON.stringify({ deviceId: "d1" }), {
        status: 200,
      });
    }
    return new Response(JSON.stringify({}), { status: 404 });
  });
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

describe("AuthGate unreachable + V3 route (V41C FIX 2)", () => {
  it("device token + probe unreachable + verify unreachable + NO valid V3 → login, never unlock", async () => {
    store["pi-finance:token"] = "dev-stale";
    mockProbeAndVerify({ probe: "unreachable", verify: "unreachable" });

    render(
      <AuthGate>
        <div data-testid="app">App Content</div>
      </AuthGate>,
    );

    await screen.findByPlaceholderText(/seu\.email@exemplo\.com/, {}, { timeout: 3000 });
    expect(screen.queryByTestId("app")).not.toBeInTheDocument();
    expect(getSessionStatus().status).toBe("unreachable");
  });

  it("device token + probe unreachable + verify OK + NO valid V3 → login, never unlock", async () => {
    store["pi-finance:token"] = "dev-stale";
    mockProbeAndVerify({ probe: "unreachable", verify: "ok" });

    render(
      <AuthGate>
        <div data-testid="app">App Content</div>
      </AuthGate>,
    );

    await screen.findByPlaceholderText(/seu\.email@exemplo\.com/, {}, { timeout: 3000 });
    expect(screen.queryByTestId("app")).not.toBeInTheDocument();
    expect(getSessionStatus().status).toBe("unreachable");
  });

  it("device token + probe unreachable + valid V3 → offline read-only unlock (authority unreachable)", async () => {
    store["pi-finance:token"] = "dev-stale";
    await seedValidV3();
    mockProbeAndVerify({ probe: "unreachable", verify: "unreachable" });

    render(
      <AuthGate>
        <div data-testid="app">App Content</div>
      </AuthGate>,
    );

    expect(await screen.findByTestId("app", {}, { timeout: 3000 })).toBeInTheDocument();
    expect(getSessionStatus().status).toBe("unreachable");
  });
});

describe("AuthGate 401 purge before login (V41C FIX 4)", () => {
  it("no token + probe 401 + valid V3 → login AND identity/snapshot purged; later unreachable must NOT unlock", async () => {
    await seedValidV3();
    expect(getOfflinePrincipalId()).toBe(PRINCIPAL);
    expect(getOfflineWorkspaceId()).toBe(WS_UUID);
    await waitFor(async () => {
      expect(
        await resolveUnreachableOfflineRoute(PRINCIPAL, WS_UUID),
      ).toBe("offline-read-only");
    });

    mockProbeAndVerify({ probe: "401", verify: "unreachable" });
    const first = render(
      <AuthGate>
        <div data-testid="app">App Content</div>
      </AuthGate>,
    );

    // Rejection → purge + login (INV-05), never offline mode.
    await screen.findByPlaceholderText(/seu\.email@exemplo\.com/, {}, { timeout: 3000 });
    expect(screen.queryByTestId("app")).not.toBeInTheDocument();
    expect(getSessionStatus().status).toBe("unauthenticated");
    // The purge must have destroyed the offline route BEFORE login published.
    expect(getOfflinePrincipalId()).toBeNull();
    expect(getOfflineWorkspaceId()).toBeNull();
    expect(
      await resolveUnreachableOfflineRoute(PRINCIPAL, WS_UUID),
    ).toBe("login");
    first.unmount();

    // A later network unavailability must NOT reopen the purged snapshot.
    resetSessionStatus();
    mockProbeAndVerify({ probe: "unreachable", verify: "unreachable" });
    render(
      <AuthGate>
        <div data-testid="app-second">App Content</div>
      </AuthGate>,
    );
    await screen.findByPlaceholderText(/seu\.email@exemplo\.com/, {}, { timeout: 3000 });
    expect(screen.queryByTestId("app-second")).not.toBeInTheDocument();
  });
});
