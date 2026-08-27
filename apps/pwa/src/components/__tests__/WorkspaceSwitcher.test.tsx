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

  it("renders active workspace name and toggles dropdown list", async () => {
    const user = userEvent.setup();

    render(<WorkspaceSwitcher compact />);
    const trigger = screen.getByRole("button", { name: /selecionar workspace/i });
    expect(trigger).toHaveTextContent("Minhas Finanças");

    // Open dropdown
    await user.click(trigger);
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    expect(screen.getByText("Empresa LTDA")).toBeInTheDocument();

    // Select other workspace
    await user.click(screen.getByRole("option", { name: /Empresa LTDA/i }));
    expect(mockContext.value.selectWorkspace).toHaveBeenCalledWith("ws-2");
  });
});
