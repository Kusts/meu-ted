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
  pendingInvites: [],
  ownershipTransfers: [],
  loading: false,
  membersLoading: false,
  pendingInvitesLoading: false,
  ownershipTransfersLoading: false,
  error: null,
  selectWorkspace: vi.fn(),
  refreshWorkspaces: vi.fn(),
  refreshMembers: vi.fn(),
  refreshPendingInvites: vi.fn(),
  refreshOwnershipTransfers: vi.fn(),
  createWorkspace: vi.fn(),
  renameWorkspace: vi.fn(),
  archiveWorkspace: vi.fn(),
  restoreWorkspace: vi.fn(),
  inviteMember: vi.fn(),
  resendInvite: vi.fn(),
  revokeInvite: vi.fn(),
  acceptInvite: vi.fn(),
  removeMember: vi.fn(),
  transferOwnership: vi.fn(),
  acceptTransfer: vi.fn(),
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

  it("owner manages pending invites and initiates ownership transfer in shared workspace", async () => {
    const user = userEvent.setup();
    context.activeWorkspace = { id: "ws-2", name: "Empresa LTDA", kind: "shared", role: "owner", status: "active" };
    context.members = [
      { userId: "user-1", name: "Alice Owner", email: "alice@example.com", role: "owner" },
      { userId: "user-2", name: "Bob Member", email: "bob@example.com", role: "member" },
    ];
    context.pendingInvites = [
      { id: "inv-1", householdId: "ws-2", email: "convidado@example.com", role: "member", expiresAt: "2026-09-07T12:00:00.000Z" },
    ];
    context.ownershipTransfers = [];

    render(<WorkspaceManagerPage />);

    // Check pending invite visibility without tokens/hashes
    expect(screen.getByText("convidado@example.com")).toBeInTheDocument();
    expect(screen.queryByText("hash")).not.toBeInTheDocument();
    expect(screen.queryByText("token")).not.toBeInTheDocument();

    // Resend invite
    await user.click(screen.getByRole("button", { name: "Reenviar convite para convidado@example.com" }));
    expect(context.resendInvite).toHaveBeenCalledWith("inv-1");

    // Revoke invite with confirmation
    await user.click(screen.getByRole("button", { name: "Revogar convite para convidado@example.com" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Revogar convite?");
    await user.click(screen.getByRole("button", { name: "Revogar convite" }));
    expect(context.revokeInvite).toHaveBeenCalledWith("inv-1");

    // Initiate ownership transfer
    expect(screen.getByRole("heading", { name: "Transferir titularidade" })).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Novo titular"), "user-2");
    await user.click(screen.getByRole("button", { name: "Transferir titularidade" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Transferir titularidade do workspace?");
    await user.click(screen.getByRole("button", { name: "Confirmar transferência" }));
    expect(context.transferOwnership).toHaveBeenCalledWith("user-2");
  });

  it("member does not see administrative invite controls, but can accept pending ownership transfer", async () => {
    const user = userEvent.setup();
    context.activeWorkspace = { id: "ws-2", name: "Empresa LTDA", kind: "shared", role: "member", status: "active" };
    context.members = [
      { userId: "user-1", name: "Alice Owner", email: "alice@example.com", role: "owner" },
      { userId: "user-2", name: "Bob Member", email: "bob@example.com", role: "member" },
    ];
    context.pendingInvites = [];
    context.ownershipTransfers = [
      { id: "transfer-1", householdId: "ws-2", fromUserId: "user-1", toUserId: "user-2", status: "pending", createdAt: "2026-08-30T10:00:00.000Z" },
    ];

    render(<WorkspaceManagerPage />);

    // Member cannot see administrative invite management or transfer initiation
    expect(screen.queryByRole("heading", { name: "Convites pendentes" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Convidar membro" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Novo titular")).not.toBeInTheDocument();

    // Member sees ownership transfer proposal and can accept it
    expect(screen.getByRole("heading", { name: "Proposta de Titularidade" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Aceitar Titularidade" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Aceitar titularidade do workspace?");
    await user.click(screen.getByRole("button", { name: "Confirmar aceitação" }));
    expect(context.acceptTransfer).toHaveBeenCalledWith("transfer-1");
  });

  it("owner can invite a member via email form in shared workspace", async () => {
    const user = userEvent.setup();
    context.activeWorkspace = { id: "ws-2", name: "Empresa LTDA", kind: "shared", role: "owner", status: "active" };
    context.members = [
      { userId: "user-1", name: "Alice Owner", email: "alice@example.com", role: "owner" },
    ];
    context.pendingInvites = [];
    context.ownershipTransfers = [];
    render(<WorkspaceManagerPage />);

    expect(screen.getByRole("heading", { name: "Convidar membro" })).toBeInTheDocument();
    const input = screen.getByLabelText("E-mail do convidado");
    await user.type(input, "novo@example.com");
    await user.click(screen.getByRole("button", { name: "Convidar membro" }));
    expect(context.inviteMember).toHaveBeenCalledWith("novo@example.com");
  });
});
