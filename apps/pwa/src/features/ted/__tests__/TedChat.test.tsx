import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@/lib/test-utils";
import userEvent from "@testing-library/user-event";
import { TedChat } from "../TedChat";
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

vi.mock("@/lib/api/agent-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/agent-client")>();
  return {
    ...actual,
    fetchAgentHistory: vi.fn().mockResolvedValue([
      { id: "msg-1", actorId: "user-1", role: "user", content: "Olá TED" },
      { id: "msg-2", actorId: "agent", role: "assistant", content: "Olá! Como posso ajudar hoje?" },
    ]),
    sendAgentMessage: vi.fn().mockResolvedValue({
      turnId: "turn-new",
      status: "completed",
      output: "Seu saldo atual é R$ 2.000,00.",
    }),
    fetchPendingOperations: vi.fn().mockResolvedValue([]),
    exportAgentHistory: vi.fn().mockResolvedValue({ version: 1, exportedAt: "now", turns: [], messages: [], actions: [], events: [] }),
    deleteAgentHistory: vi.fn().mockResolvedValue({ deleted: true, recordCount: 2 }),
  };
});

describe("TedChat Component (Task 10)", () => {
  const onCloseMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(agentAuth, "fetchAgentConnectionToken").mockResolvedValue("mock-connection-token");
  });

  it("does not render dialog when open is false", () => {
    const { container } = render(<TedChat open={false} onClose={onCloseMock} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders messages and allows sending new message", async () => {
    const user = userEvent.setup();

    render(<TedChat open={true} onClose={onCloseMock} />);

    expect(await screen.findByText("Olá TED")).toBeInTheDocument();
    expect(await screen.findByText("Olá! Como posso ajudar hoje?")).toBeInTheDocument();

    const input = screen.getByPlaceholderText("Pergunte sobre gastos, metas ou pagamentos…");
    await user.type(input, "Qual meu saldo?");
    await user.click(screen.getByRole("button", { name: /enviar mensagem/i }));

    expect(agentClient.sendAgentMessage).toHaveBeenCalledWith("ws-1", "Qual meu saldo?");
    expect(await screen.findByText("Seu saldo atual é R$ 2.000,00.")).toBeInTheDocument();
  });

  it("calls onClose when close button is clicked", async () => {
    const user = userEvent.setup();
    render(<TedChat open={true} onClose={onCloseMock} />);

    await user.click(screen.getByRole("button", { name: /fechar chat/i }));
    expect(onCloseMock).toHaveBeenCalled();
  });
});
