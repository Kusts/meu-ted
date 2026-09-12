import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@/lib/test-utils";
import userEvent from "@testing-library/user-event";
import { WorkspaceSwitcher } from "../WorkspaceSwitcher";

const mockContext = vi.hoisted(() => ({
  value: {
    workspaces: [
      { id: "ws-1", name: "Minhas Finanças", kind: "personal" as const, role: "owner" },
      { id: "ws-2", name: "Empresa LTDA", kind: "shared" as const, role: "member" },
    ],
    activeWorkspace: { id: "ws-1", name: "Minhas Finanças", kind: "personal" as const, role: "owner" },
    members: [],
    loading: false,
    membersLoading: false,
    error: null,
    selectWorkspace: vi.fn(),
    refreshWorkspaces: vi.fn(),
    refreshMembers: vi.fn(),
    createWorkspace: vi.fn(),
    inviteMember: vi.fn(),
    acceptInvite: vi.fn(),
    removeMember: vi.fn(),
    leave: vi.fn(),
  },
}));

vi.mock("@/lib/auth/workspace-context", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/workspace-context")>();
  return {
    ...actual,
    useWorkspace: () => mockContext.value,
    useWorkspaceSafe: () => mockContext.value,
  };
});

describe("WorkspaceSwitcher Component (Task 9)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockContext.value = {
      workspaces: [
        { id: "ws-1", name: "Minhas Finanças", kind: "personal" as const, role: "owner" },
        { id: "ws-2", name: "Empresa LTDA", kind: "shared" as const, role: "member" },
      ],
      activeWorkspace: { id: "ws-1", name: "Minhas Finanças", kind: "personal" as const, role: "owner" },
      members: [],
      loading: false,
      membersLoading: false,
      error: null,
      selectWorkspace: vi.fn(),
      refreshWorkspaces: vi.fn(),
      refreshMembers: vi.fn(),
      createWorkspace: vi.fn(),
      inviteMember: vi.fn(),
      acceptInvite: vi.fn(),
      removeMember: vi.fn(),
      leave: vi.fn(),
    };
  });

  it("renders loading state when workspace context is loading", () => {
    mockContext.value = {
      ...mockContext.value,
      loading: true,
      workspaces: [],
      activeWorkspace: null,
    };

    render(<WorkspaceSwitcher />);
    expect(screen.getByText("Carregando…")).toBeInTheDocument();
  });

  it("does not render Offline when workspace loading fails due to authorization error", () => {
    mockContext.value = {
      ...mockContext.value,
      workspaces: [],
      activeWorkspace: null,
      error: "Token inválido",
    };

    render(<WorkspaceSwitcher />);
    expect(screen.queryByText("Offline")).not.toBeInTheDocument();
    expect(screen.getByText("Não autorizado")).toBeInTheDocument();
  });

  it("renders clear local-data copy (no bare Offline) when workspace loading fails due to network or backend unavailability", () => {
    mockContext.value = {
      ...mockContext.value,
      workspaces: [],
      activeWorkspace: null,
      error: "API offline",
    };

    render(<WorkspaceSwitcher />);
    expect(screen.getByText("Sem conexão")).toBeInTheDocument();
    expect(screen.getByTitle("Sem conexão – dados locais")).toBeInTheDocument();
    expect(screen.queryByText("Não autorizado")).not.toBeInTheDocument();
  });

  it("renders hero variant styling for authorization error badge", () => {
    mockContext.value = {
      ...mockContext.value,
      workspaces: [],
      activeWorkspace: null,
      error: "HTTP 401",
    };

    render(<WorkspaceSwitcher variant="hero" />);
    const badge = screen.getByText("Não autorizado").closest("div");
    expect(badge).toHaveAttribute("data-variant", "hero");
    expect(badge?.className).toContain("border-danger/40");
  });

  it("renders active workspace name and toggles dropdown list", async () => {
    const user = userEvent.setup();

    render(<WorkspaceSwitcher compact />);
    const trigger = screen.getByRole("button", { name: /selecionar espaço/i });
    expect(trigger).toHaveTextContent("Minhas Finanças");

    // Open dropdown
    await user.click(trigger);
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    expect(screen.getByText("Empresa LTDA")).toBeInTheDocument();

    // Select other workspace
    await user.click(screen.getByRole("option", { name: /Empresa LTDA/i }));
    expect(mockContext.value.selectWorkspace).toHaveBeenCalledWith("ws-2");
  });

  it("keeps archived workspaces out of quick selection and links to management", async () => {
    const user = userEvent.setup();
    mockContext.value = {
      ...mockContext.value,
      workspaces: [
        { id: "ws-1", name: "Minhas Finanças", kind: "personal" as const, role: "owner", status: "active" as const },
        { id: "ws-2", name: "Empresa Arquivada", kind: "shared" as const, role: "owner", status: "archived" as const },
      ],
      activeWorkspace: { id: "ws-1", name: "Minhas Finanças", kind: "personal" as const, role: "owner", status: "active" as const },
    };

    render(<WorkspaceSwitcher compact />);
    await user.click(screen.getByRole("button", { name: /selecionar espaço/i }));

    expect(screen.queryByRole("option", { name: /Empresa Arquivada/i })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Gerenciar espaços" })).toHaveAttribute("href", "/workspaces");
  });

  it("renders default variant with surface-1 styling by default", () => {
    render(<WorkspaceSwitcher compact />);
    const trigger = screen.getByRole("button", { name: /selecionar espaço/i });
    expect(trigger.className).toContain("bg-surface-1");
    expect(trigger.className).toContain("border-border-subtle");
    expect(trigger).toHaveAttribute("data-variant", "default");
  });

  it("renders hero variant with translucent styling and white text", () => {
    render(<WorkspaceSwitcher variant="hero" compact />);
    const trigger = screen.getByRole("button", { name: /selecionar espaço/i });
    expect(trigger).toHaveAttribute("data-variant", "hero");
    expect(trigger.className).toContain("bg-white/[0.14]");
    expect(trigger.className).toContain("border-white/15");
    expect(trigger.querySelector(".text-white")).toBeInTheDocument();
  });

  it("renders hero loading state with translucent styling", () => {
    mockContext.value = {
      ...mockContext.value,
      loading: true,
      workspaces: [],
      activeWorkspace: null,
    };

    render(<WorkspaceSwitcher variant="hero" compact />);
    const loadingEl = screen.getByText("Carregando…").closest("div");
    expect(loadingEl).toHaveAttribute("data-variant", "hero");
    expect(loadingEl?.className).toContain("bg-white/[0.14]");
    expect(loadingEl?.className).toContain("border-white/15");
  });

  it("supports opening and selecting workspace in hero variant", async () => {
    const user = userEvent.setup();
    render(<WorkspaceSwitcher variant="hero" compact />);
    const trigger = screen.getByRole("button", { name: /selecionar espaço/i });

    await user.click(trigger);
    expect(screen.getByRole("listbox")).toBeInTheDocument();

    await user.click(screen.getByRole("option", { name: /Empresa LTDA/i }));
    expect(mockContext.value.selectWorkspace).toHaveBeenCalledWith("ws-2");
  });
});
