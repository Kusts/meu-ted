import { describe, expect, it, vi, beforeEach } from "vitest";
import { useState } from "react";
import "fake-indexeddb/auto";
import { render, screen } from "@/lib/test-utils";
import userEvent from "@testing-library/user-event";
import { WorkspaceProvider, useWorkspace } from "./workspace-context";
import { saveSnapshotDomain, loadSnapshotDomain } from "@/lib/state/snapshot-store";

const api = vi.hoisted(() => ({
  fetchWorkspaces: vi.fn(),
  fetchWorkspaceMembers: vi.fn(),
  createWorkspace: vi.fn(),
  renameWorkspace: vi.fn(),
  archiveWorkspace: vi.fn(),
  restoreWorkspace: vi.fn(),
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
  const { activeWorkspace, workspaces, selectWorkspace, error, members, refreshMembers, renameWorkspace, archiveWorkspace, restoreWorkspace } = useWorkspace();
  const [refreshError, setRefreshError] = useState<string | null>(null);
  return <>
    <div data-testid="active">{activeWorkspace?.name ?? "none"}</div>
    <div data-testid="error">{error ?? "no-error"}</div>
    <div data-testid="refresh-error">{refreshError ?? "no-refresh-error"}</div>
    <div data-testid="members-count">{members.length}</div>
    <button onClick={() => void renameWorkspace("workspace-1", "Casa renomeada")}>Rename</button>
    <button onClick={() => void archiveWorkspace("workspace-1")}>Archive</button>
    <button onClick={() => void restoreWorkspace("workspace-2")}>Restore</button>
    <button onClick={async () => {
      try {
        await refreshMembers();
      } catch (e: any) {
        setRefreshError(e.message);
      }
    }}>Refresh Members</button>
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
    api.fetchWorkspaceMembers.mockResolvedValue([]);
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
    expect(screen.getByTestId("active")).toHaveTextContent("Casa");
  });

  it("throws an error when useWorkspace is rendered outside WorkspaceProvider", () => {
    const originalError = console.error;
    console.error = vi.fn();
    try {
      expect(() => render(<Probe />)).toThrow("useWorkspace must be used inside WorkspaceProvider");
    } finally {
      console.error = originalError;
    }
  });

  it("propagates error when refreshMembers fails instead of converting it to silent empty list", async () => {
    api.fetchWorkspaceMembers.mockRejectedValue(new Error("Network failure fetching members"));
    const user = userEvent.setup();
    render(<WorkspaceProvider><Probe /></WorkspaceProvider>);
    expect(await screen.findByTestId("active")).toHaveTextContent("Casa");

    await user.click(screen.getByRole("button", { name: "Refresh Members" }));
    expect(await screen.findByTestId("refresh-error")).toHaveTextContent("Network failure fetching members");
  });

  it("does not stay in infinite loading when fetchWorkspaces fails", async () => {
    api.fetchWorkspaces.mockRejectedValue(new Error("API offline"));
    render(<WorkspaceProvider><Probe /></WorkspaceProvider>);

    expect(await screen.findByTestId("error")).toHaveTextContent("API offline");
    expect(screen.queryByText("Carregando workspaces…")).not.toBeInTheDocument();
  });

  it("keeps archived workspaces visible but never selects one as active", async () => {
    api.fetchWorkspaces.mockResolvedValue([
      { id: "workspace-1", name: "Casa", kind: "personal", role: "owner", status: "archived" },
      { id: "workspace-2", name: "Equipe", kind: "shared", role: "member", status: "active" },
    ]);
    render(<WorkspaceProvider><Probe /></WorkspaceProvider>);

    expect(await screen.findByTestId("active")).toHaveTextContent("Equipe");
    await userEvent.setup().click(screen.getByRole("button", { name: "Casa" }));
    expect(screen.getByTestId("active")).toHaveTextContent("Equipe");
  });

  it("refreshes the authorized list after lifecycle operations", async () => {
    api.renameWorkspace.mockResolvedValue({ id: "workspace-1", name: "Casa renomeada", kind: "personal", role: "owner", status: "active" });
    api.archiveWorkspace.mockResolvedValue({ id: "workspace-1", name: "Casa", kind: "personal", role: "owner", status: "archived" });
    api.restoreWorkspace.mockResolvedValue({ id: "workspace-2", name: "Equipe", kind: "shared", role: "member", status: "active" });
    const user = userEvent.setup();
    render(<WorkspaceProvider><Probe /></WorkspaceProvider>);
    expect(await screen.findByTestId("active")).toHaveTextContent("Casa");

    await user.click(screen.getByRole("button", { name: "Rename" }));
    await user.click(screen.getByRole("button", { name: "Archive" }));
    await user.click(screen.getByRole("button", { name: "Restore" }));

    expect(api.renameWorkspace).toHaveBeenCalledWith("workspace-1", "Casa renomeada");
    expect(api.archiveWorkspace).toHaveBeenCalledWith("workspace-1");
    expect(api.restoreWorkspace).toHaveBeenCalledWith("workspace-2");
  });
});
