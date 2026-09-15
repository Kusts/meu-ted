/**
 * T5.3 deep-link (SPEC §22) — TED focuses the selected pending operation.
 *
 * - The launcher routes `openTedChat({ operationId })` into the single chat
 *   (no second executor).
 * - The chat highlights/focuses the matching approval card accessibly and
 *   never invents a card: an unknown id stays honest.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@/lib/test-utils";
import userEvent from "@testing-library/user-event";
import { TedChat } from "../TedChat";
import { TedChatLauncher, OPEN_TED_CHAT_EVENT, openTedChat } from "../TedChatLauncher";
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
  return { ...actual, useWorkspace: () => mockWs, useWorkspaceSafe: () => mockWs };
});

vi.mock("@/lib/state/app-state-context", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/state/app-state-context")>();
  return { ...actual, useAppState: () => ({ reconcileMutation: vi.fn() }) };
});

vi.mock("next/image", () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} />
  ),
}));

const pendingOp = (id: string) => ({
  id,
  status: "proposed" as const,
  operation: "transactions.expense.create",
  summary: id === "op-2" ? "Assinatura" : "Mercado",
});

describe("TedChat deep-link focus (T5.3)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("focuses/highlights the selected approval card without inventing state", async () => {
    vi.spyOn(agentClient, "fetchAgentHistory").mockResolvedValue([]);
    vi.spyOn(agentClient, "sendAgentMessage").mockResolvedValue({
      turnId: "turn-1",
      status: "completed",
      pendingOperation: pendingOp("op-1"),
    });

    const user = userEvent.setup();
    render(<TedChat open onClose={() => {}} focusedOperationId="op-1" />);

    await user.type(screen.getByLabelText("Mensagem para o assistente"), "registre mercado 850");
    await user.click(screen.getByRole("button", { name: "Enviar mensagem" }));

    const focused = await screen.findByTestId("ted-approval-focused");
    expect(focused).toHaveTextContent("Mercado");
    // Accessible focus target: the focused card wrapper receives focus.
    await waitFor(() => expect(focused).toHaveFocus());
  });

  it("stays honest when the selected operation is unavailable", async () => {
    vi.spyOn(agentClient, "fetchAgentHistory").mockResolvedValue([]);
    vi.spyOn(agentClient, "sendAgentMessage").mockResolvedValue({ turnId: "t", status: "completed" });

    render(<TedChat open onClose={() => {}} focusedOperationId="op-missing" />);

    expect(
      await screen.findByText("Operação não encontrada nesta conversa."),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("ted-approval-focused")).not.toBeInTheDocument();
    // No second executor: the honest fallback never renders approve/cancel itself.
    expect(screen.queryByRole("button", { name: /^Aprovar$/i })).not.toBeInTheDocument();
  });

  it("launcher routes openTedChat({ operationId }) into the single chat", async () => {
    vi.spyOn(agentClient, "fetchAgentHistory").mockResolvedValue([]);

    const user = userEvent.setup();
    render(<TedChatLauncher />);

    expect(screen.queryByRole("dialog", { name: "Chat com TED" })).not.toBeInTheDocument();
    const { act } = await import("react");
    act(() => {
      openTedChat({ operationId: "op-9" });
    });
    expect(await screen.findByRole("dialog", { name: "Chat com TED" })).toBeInTheDocument();
    // Single executor: exactly one dialog, no parallel chat.
    expect(screen.getAllByRole("dialog", { name: "Chat com TED" })).toHaveLength(1);
    expect(OPEN_TED_CHAT_EVENT).toBe("pwa:open-ted");
    // The selected id reaches the single chat: unknown ids stay honest.
    expect(
      await screen.findByText("Operação não encontrada nesta conversa."),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Fechar chat" }));
  });
});
