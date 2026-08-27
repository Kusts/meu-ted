import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@/lib/test-utils";
import userEvent from "@testing-library/user-event";
import { TedChatLauncher } from "@/features/ted/TedChatLauncher";
import * as agentAuth from "@/lib/api/agent-auth";
import * as agentClient from "@/lib/api/agent-client";

vi.mock("@/lib/auth/workspace-context", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/workspace-context")>();
  const mockWs = {
    workspaces: [{ id: "ws-1", name: "Minhas Finanças", kind: "personal" as const, role: "owner" }],
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
  return {
    ...actual,
    useWorkspace: () => mockWs,
    useWorkspaceSafe: () => mockWs,
  };
});

describe("TedChatLauncher Component (Task 10)", () => {
  it("renders floating launcher button and opens TedChat when clicked", async () => {
    const user = userEvent.setup();

    vi.spyOn(agentAuth, "fetchAgentConnectionToken").mockResolvedValue("mock-token");
    vi.spyOn(agentClient, "fetchAgentHistory").mockResolvedValue([]);
    vi.spyOn(agentClient, "fetchPendingOperations").mockResolvedValue([]);

    render(<TedChatLauncher />);

    const launcher = screen.getByRole("button", { name: /abrir assistente ted/i });
    expect(launcher).toBeInTheDocument();

    // Click launcher
    await user.click(launcher);
    expect(await screen.findByRole("dialog", { name: /chat com ted/i })).toBeInTheDocument();
  });
});
