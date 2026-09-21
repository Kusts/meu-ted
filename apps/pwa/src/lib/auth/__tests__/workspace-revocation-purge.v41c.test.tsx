import { describe, expect, it, vi, beforeEach } from "vitest";
import "fake-indexeddb/auto";
import { render, screen, waitFor } from "@/lib/test-utils";
import userEvent from "@testing-library/user-event";
import { WorkspaceProvider, useWorkspace } from "../workspace-context";
import {
  getOfflinePrincipalId,
  getOfflineWorkspaceId,
  setOfflineWorkspaceId,
  setOfflinePrincipalId,
} from "@/lib/auth/offline-identity";
import {
  getLastOnlineAuthenticatedAt,
  stampLastOnlineAuthenticatedAt,
} from "@/lib/session";
import { resetSessionStatus } from "@/lib/auth/session-authority";

/**
 * V41C-FIX-PWA-P1 FIX 3 (P1, AUTH-T07) — RED.
 *
 * An automatic workspace switch caused by revoked membership must purge the
 * workspace-side offline binding (offlineWorkspaceId, offlineSubjectId, age
 * stamp) via `clearWorkspaceBinding: true`, keeping the user principal for
 * rebinding. Today both auto-switch paths call `clearSensitiveSession`
 * WITHOUT the flag, so binding + stamp survive (only snapshots/profile go).
 */

const sessionSpy = vi.hoisted(() => ({
  clearSensitiveSession: vi.fn(),
}));

vi.mock("@/lib/session", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/session")>();
  sessionSpy.clearSensitiveSession.mockImplementation(
    actual.clearSensitiveSession,
  );
  return { ...actual, clearSensitiveSession: sessionSpy.clearSensitiveSession };
});

const api = vi.hoisted(() => ({
  fetchWorkspaces: vi.fn(),
  fetchWorkspaceMembers: vi.fn(),
  fetchPendingInvites: vi.fn(),
  fetchOwnershipTransfers: vi.fn(),
}));
vi.mock("@/lib/api/workspaces", () => api);
vi.mock("../socket-registry", () => ({ closeAllSockets: vi.fn() }));
vi.mock("@/lib/api/client", () => ({
  isApiConfigured: () => true,
  getAuthToken: () => undefined,
  getSessionToken: () => undefined,
  // No-op recorder (NOT the real choke point): the test observes exactly
  // what clearSensitiveSession purged, without rebinding noise.
  setActiveWorkspaceId: vi.fn(),
  clearActiveWorkspaceId: vi.fn(),
  apiFetch: vi.fn(),
  ApiError: class ApiError extends Error {
    constructor(
      public status: number,
      public code: string,
      message: string,
    ) {
      super(message);
    }
  },
}));

const WS1 = "11111111-2222-4333-8444-555555555555";
const WS2 = "66666666-7777-4888-8999-aaaaaaaaaaaa";

function Probe() {
  const { activeWorkspace, refreshWorkspaces } = useWorkspace();
  return (
    <>
      <div data-testid="active">{activeWorkspace?.name ?? "none"}</div>
      <button onClick={() => void refreshWorkspaces()}>Refresh</button>
    </>
  );
}

describe("WorkspaceProvider — revocation auto-switch purges binding (V41C FIX 3)", () => {
  beforeEach(async () => {
    resetSessionStatus();
    localStorage.clear();
    sessionSpy.clearSensitiveSession.mockClear();
    const dbs = await indexedDB.databases();
    for (const db of dbs) if (db.name) indexedDB.deleteDatabase(db.name);
    vi.stubEnv("NEXT_PUBLIC_PI_FINANCE_API_BASE_URL", "http://localhost:3001");
    api.fetchWorkspaces.mockResolvedValue([
      { id: WS1, name: "Casa", kind: "personal", role: "owner", status: "active" },
      { id: WS2, name: "Equipe", kind: "shared", role: "owner", status: "active" },
    ]);
    api.fetchWorkspaceMembers.mockResolvedValue([]);
    api.fetchPendingInvites.mockResolvedValue([]);
    api.fetchOwnershipTransfers.mockResolvedValue([]);
  });

  it("revoked membership auto-switch passes clearWorkspaceBinding and purges binding + stamp, keeping the principal", async () => {
    const user = userEvent.setup();
    render(
      <WorkspaceProvider>
        <Probe />
      </WorkspaceProvider>,
    );
    expect(await screen.findByTestId("active")).toHaveTextContent("Casa");

    // Bound identity from the last online authentication in WS1.
    setOfflinePrincipalId("user-1");
    expect(setOfflineWorkspaceId(WS1)).toBe(true);
    stampLastOnlineAuthenticatedAt();
    expect(getOfflineWorkspaceId()).toBe(WS1);
    expect(getLastOnlineAuthenticatedAt()).not.toBeNull();

    // Membership in WS1 revoked server-side: the list no longer contains it.
    api.fetchWorkspaces.mockResolvedValue([
      { id: WS2, name: "Equipe", kind: "shared", role: "owner", status: "active" },
    ]);
    await user.click(screen.getByRole("button", { name: "Refresh" }));

    await waitFor(() =>
      expect(screen.getByTestId("active")).toHaveTextContent("Equipe"),
    );

    // The revocation-triggered auto-switch must carry the binding purge flag…
    expect(sessionSpy.clearSensitiveSession).toHaveBeenCalledWith(
      expect.objectContaining({ clearWorkspaceBinding: true }),
    );
    // …so the old workspace binding + age stamp are gone…
    expect(getOfflineWorkspaceId()).toBeNull();
    expect(getLastOnlineAuthenticatedAt()).toBeNull();
    // …while the user principal survives for rebinding.
    expect(getOfflinePrincipalId()).toBe("user-1");
  });
});
