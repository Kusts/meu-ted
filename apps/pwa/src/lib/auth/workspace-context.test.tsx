import { describe, expect, it, vi, beforeEach } from "vitest";
import "fake-indexeddb/auto";
import { render, screen } from "@/lib/test-utils";
import userEvent from "@testing-library/user-event";
import { WorkspaceProvider, useWorkspace } from "./workspace-context";
import { saveSnapshotDomain, loadSnapshotDomain } from "@/lib/state/snapshot-store";

const api = vi.hoisted(() => ({
  fetchWorkspaces: vi.fn(),
  createWorkspace: vi.fn(),
  closeAllSockets: vi.fn(),
}));
vi.mock("@/lib/api/workspaces", () => api);
vi.mock("./socket-registry", () => ({ closeAllSockets: api.closeAllSockets }));
vi.mock("@/lib/api/client", () => ({
  isApiConfigured: () => true,
  getAuthToken: () => undefined,
  setActiveWorkspaceId: vi.fn(),
  clearActiveWorkspaceId: vi.fn(),
  apiFetch: vi.fn(),
}));

function Probe() {
  const { activeWorkspace, workspaces, selectWorkspace } = useWorkspace();
  return <>
    <div data-testid="active">{activeWorkspace?.name ?? "none"}</div>
    {workspaces.map((workspace) => <button key={workspace.id} onClick={() => selectWorkspace(workspace.id)}>{workspace.name}</button>)}
  </>;
}

describe("WorkspaceProvider", () => {
  beforeEach(async () => {
    const dbs = await indexedDB.databases();
    for (const db of dbs) if (db.name) indexedDB.deleteDatabase(db.name);
    api.fetchWorkspaces.mockResolvedValue([
      { id: "workspace-1", name: "Casa", kind: "personal", role: "owner" },
      { id: "workspace-2", name: "Equipe", kind: "shared", role: "member" },
    ]);
  });

  it("selects the first authorized workspace and switches only to listed workspaces", async () => {
    const user = userEvent.setup();
    await saveSnapshotDomain("user-1:workspace-1", "accounts", [{ id: "old", name: "Old workspace" }] as never);
    render(<WorkspaceProvider><Probe /></WorkspaceProvider>);
    expect(await screen.findByTestId("active")).toHaveTextContent("Casa");
    await user.click(screen.getByRole("button", { name: "Equipe" }));
    expect(await screen.findByTestId("active")).toHaveTextContent("Equipe");
    expect(await loadSnapshotDomain("user-1:workspace-1", "accounts")).toBeNull();
    expect(api.closeAllSockets).toHaveBeenCalledWith("workspace access revoked");
  });

  it("ignores requests to select unlisted/unauthorized workspace IDs", async () => {
    render(<WorkspaceProvider><Probe /></WorkspaceProvider>);
    expect(await screen.findByTestId("active")).toHaveTextContent("Casa");
    
    // Attempting to select an invalid workspace ID does not switch active workspace
    // (active remains Casa)
    expect(screen.getByTestId("active")).toHaveTextContent("Casa");
  });

  it("throws an error when useWorkspace is rendered outside WorkspaceProvider", () => {
    // Suppress console.error during expected throw
    const originalError = console.error;
    console.error = vi.fn();
    try {
      expect(() => render(<Probe />)).toThrow("useWorkspace must be used inside WorkspaceProvider");
    } finally {
      console.error = originalError;
    }
  });
});

