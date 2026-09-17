import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch, FORBIDDEN_EVENT } from "../client";
import { writeV2Snapshot, readV2Snapshot } from "@/lib/state/snapshot-db";
import { setOfflineSubjectId } from "@/lib/auth/offline-subject";

/**
 * V4.1 Phase 5 (Task 5.9 + D10): membership revocation purges the offline
 * snapshot. The API revokes on removeMember/leave (Phase 1); when a request
 * answers 403 workspace_forbidden the PWA must purge its snapshot and take
 * the unauthenticated transition (→ login, never offline mode).
 */
const TOKEN = "revocation-probe-token";
const SUBJECT = "33333333-4444-4555-8666-777777777777";

function mockStatus(status: number, body: unknown): void {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify(body), { status }),
  );
}

describe("revocation purge on 403 workspace_forbidden (D10)", () => {
  beforeEach(async () => {
    localStorage.clear();
    vi.stubEnv("NEXT_PUBLIC_PI_FINANCE_API_BASE_URL", "https://api.example.com");
    const dbs = await indexedDB.databases();
    for (const db of dbs) if (db.name) indexedDB.deleteDatabase(db.name);
    setOfflineSubjectId(SUBJECT);
    await writeV2Snapshot(TOKEN, "accounts", [{ id: "a1" }] as never);
    expect(await readV2Snapshot(TOKEN, "accounts")).not.toBeNull();
  });

  afterEach(() => {
    localStorage.clear();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("dispatches the forbidden event on 403 workspace_forbidden", async () => {
    mockStatus(403, { code: "workspace.forbidden", message: "Acesso restrito" });
    const handler = vi.fn();
    window.addEventListener(FORBIDDEN_EVENT, handler);
    try {
      await expect(apiFetch("/workspaces")).rejects.toMatchObject({ status: 403 });
      expect(handler).toHaveBeenCalledOnce();
    } finally {
      window.removeEventListener(FORBIDDEN_EVENT, handler);
    }
  });

  it("purges the offline snapshot on 403 workspace_forbidden", async () => {
    mockStatus(403, { code: "auth.workspace_forbidden", message: "Sem acesso" });
    await expect(apiFetch("/accounts")).rejects.toMatchObject({ status: 403 });
    // Purge is best-effort async — allow the queued IndexedDB delete to land.
    await vi.waitFor(async () => {
      expect(await readV2Snapshot(TOKEN, "accounts")).toBeNull();
    });
  });

  it("does not purge or fire the event on non-revocation errors", async () => {
    mockStatus(500, { code: "server.error", message: "boom" });
    const handler = vi.fn();
    window.addEventListener(FORBIDDEN_EVENT, handler);
    try {
      await expect(apiFetch("/accounts")).rejects.toMatchObject({ status: 500 });
      expect(handler).not.toHaveBeenCalled();
      expect(await readV2Snapshot(TOKEN, "accounts")).not.toBeNull();
    } finally {
      window.removeEventListener(FORBIDDEN_EVENT, handler);
    }
  });
});
