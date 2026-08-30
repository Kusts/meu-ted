import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@/lib/test-utils";
import userEvent from "@testing-library/user-event";
import WorkspaceManagerPage from "../WorkspaceManagerPage";

const context = vi.hoisted(() => ({
  workspaces: [
    { id: "ws-1", name: "Minhas Finanças", kind: "personal" as const, role: "owner" as const, status: "active" as const },
    { id: "ws-2", name: "Empresa LTDA", kind: "shared" as const, role: "owner" as const, status: "archived" as const },
  ],
  activeWorkspace: { id: "ws-1", name: "Minhas Finanças", kind: "personal" as const, role: "owner" as const, status: "active" as const },
  members: [],
  loading: false,
  membersLoading: false,
  error: null,
  selectWorkspace: vi.fn(),
  refreshWorkspaces: vi.fn(),
  refreshMembers: vi.fn(),
  createWorkspace: vi.fn(),
  renameWorkspace: vi.fn(),
  archiveWorkspace: vi.fn(),
  restoreWorkspace: vi.fn(),
  inviteMember: vi.fn(),
  acceptInvite: vi.fn(),
  removeMember: vi.fn(),
  leave: vi.fn(),
}));

vi.mock("@/lib/auth/workspace-context", () => ({
  useWorkspace: () => context,
  useWorkspaceSafe: () => context,
}));

describe("WorkspaceManagerPage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders active and archived workspaces with role and lifecycle state", () => {
    render(<WorkspaceManagerPage />);

    expect(screen.getByRole("heading", { name: "Workspaces" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Minhas Finanças" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Empresa LTDA" })).toBeInTheDocument();
    expect(screen.getByText("Ativo")).toBeInTheDocument();
    expect(screen.getByText("Arquivado")).toBeInTheDocument();
  });

  it("creates a workspace from the manager form", async () => {
    const user = userEvent.setup();
    render(<WorkspaceManagerPage />);

    await user.type(screen.getByLabelText("Nome do workspace"), "Novo time");
    await user.click(screen.getByRole("button", { name: "Criar workspace" }));

    expect(context.createWorkspace).toHaveBeenCalledWith({ name: "Novo time", kind: "shared" });
  });

  it("confirms archive and restores an archived workspace", async () => {
    const user = userEvent.setup();
    render(<WorkspaceManagerPage />);

    await user.click(screen.getByRole("button", { name: "Arquivar Minhas Finanças" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Arquivar workspace?");
    await user.click(screen.getByRole("button", { name: "Arquivar workspace" }));
    expect(context.archiveWorkspace).toHaveBeenCalledWith("ws-1");

    await user.click(screen.getByRole("button", { name: "Restaurar Empresa LTDA" }));
    expect(context.restoreWorkspace).toHaveBeenCalledWith("ws-2");
  });
});
