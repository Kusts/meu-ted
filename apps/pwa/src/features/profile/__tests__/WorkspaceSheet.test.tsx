import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@/lib/test-utils";
import userEvent from "@testing-library/user-event";
import WorkspaceSheet from "../WorkspaceSheet";

const workspace = vi.hoisted(() => ({
  workspaces: [
    { id: "workspace-1", name: "Casa", kind: "personal", role: "owner" },
    { id: "workspace-2", name: "Equipe", kind: "shared", role: "owner" },
  ],
  activeWorkspace: { id: "workspace-2", name: "Equipe", kind: "shared", role: "owner" },
  members: [{ userId: "member-1", name: "Ana", email: "ana@example.com", role: "member" }],
  membersLoading: false,
  selectWorkspace: vi.fn(),
  inviteMember: vi.fn(),
  removeMember: vi.fn(),
  acceptInvite: vi.fn(),
  createWorkspace: vi.fn(),
  refreshWorkspaces: vi.fn(),
  refreshMembers: vi.fn(),
  leave: vi.fn(),
}));
vi.mock("@/lib/auth/workspace-context", () => ({ useWorkspace: () => ({ ...workspace, loading: false, error: null }), useWorkspaceSafe: () => ({ ...workspace, loading: false, error: null }) }));

describe("WorkspaceSheet", () => {
  it("switches workspace and exposes owner member actions", async () => {
    const user = userEvent.setup();
    render(<WorkspaceSheet open onClose={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Workspaces" })).toBeInTheDocument();
    await user.click(screen.getByText("Casa").closest("button")!);
    expect(workspace.selectWorkspace).toHaveBeenCalledWith("workspace-1");
    expect(screen.getByText("Ana")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remover Ana" })).toBeInTheDocument();
  });

  it("sends a member invite from the active shared workspace", async () => {
    const user = userEvent.setup();
    render(<WorkspaceSheet open onClose={vi.fn()} />);
    await user.type(screen.getByLabelText("Email do convidado"), "novo@example.com");
    await user.click(screen.getByRole("button", { name: "Convidar membro" }));
    expect(workspace.inviteMember).toHaveBeenCalledWith("novo@example.com");
  });
});
