import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@/lib/test-utils";
import { AgentTranscript } from "../ProfilePage";
import * as agentClient from "@/lib/api/agent-client";

vi.mock("@/lib/api/agent-client", () => ({
  fetchAgentHistory: vi.fn(),
  exportAgentHistory: vi.fn(),
  deleteAgentHistory: vi.fn(),
  fetchPendingOperations: vi.fn(),
  approvePendingOperation: vi.fn(),
  rejectPendingOperation: vi.fn(),
  sendAgentMessage: vi.fn(),
  processAgentTurn: vi.fn(),
  reconnectAgentTurn: vi.fn(),
  cancelAgentTurn: vi.fn(),
  retryAgentTurn: vi.fn(),
}));

describe("AgentTranscript", () => {
  beforeEach(() => {
    vi.mocked(agentClient.fetchPendingOperations).mockResolvedValue([]);
  });

  it("renders the actor for every shared-workspace message", async () => {
    vi.mocked(agentClient.fetchAgentHistory).mockResolvedValue([
      { id: "m1", actorId: "user-a", role: "user", content: "Mensagem de A" },
      { id: "m2", actorId: "user-b", role: "user", content: "Mensagem de B" },
    ]);

    render(<AgentTranscript open workspaceId="workspace-shared" />);

    expect(await screen.findByText("Mensagem de A")).toBeInTheDocument();
    expect(screen.getByText("user-a")).toBeInTheDocument();
    expect(screen.getByText("user-b")).toBeInTheDocument();
    expect(agentClient.fetchAgentHistory).toHaveBeenCalledWith("workspace-shared");
  });

  it("retries a failed turn and appends the retried assistant output", async () => {
    vi.mocked(agentClient.fetchAgentHistory).mockResolvedValue([]);
    vi.mocked(agentClient.sendAgentMessage).mockResolvedValue({ turnId: "t2", status: "queued" });
    vi.mocked(agentClient.processAgentTurn)
      .mockResolvedValueOnce({ turnId: "t2", status: "failed" })
      .mockResolvedValueOnce({ turnId: "t2", status: "completed", output: "Resposta após retry" });
    vi.mocked(agentClient.reconnectAgentTurn)
      .mockResolvedValueOnce([{ id: 1, type: "failed", data: "{}" }])
      .mockResolvedValueOnce([{ id: 2, type: "completed", data: "{}" }]);
    vi.mocked(agentClient.retryAgentTurn).mockResolvedValue({ turnId: "t2", status: "queued" });

    render(<AgentTranscript open workspaceId="workspace-shared" />);
    fireEvent.change(await screen.findByRole("textbox", { name: "Mensagem do agente" }), { target: { value: "Olá" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar" }));
    const retryButton = await screen.findByRole("button", { name: "Tentar novamente" });
    fireEvent.click(retryButton);

    await waitFor(() => expect(screen.getByText("Resposta após retry")).toBeInTheDocument());
    expect(agentClient.reconnectAgentTurn).toHaveBeenCalledTimes(2);
  });

  it("recovers assistant output when the process request loses connectivity", async () => {
    vi.mocked(agentClient.fetchAgentHistory).mockResolvedValue([]);
    vi.mocked(agentClient.sendAgentMessage).mockResolvedValue({ turnId: "t3", status: "queued" });
    vi.mocked(agentClient.processAgentTurn).mockRejectedValue(new Error("network"));
    vi.mocked(agentClient.reconnectAgentTurn).mockResolvedValue([{ id: 4, type: "completed", data: JSON.stringify({ output: "Resposta recuperada" }) }]);

    render(<AgentTranscript open workspaceId="workspace-shared" />);
    fireEvent.change(await screen.findByRole("textbox", { name: "Mensagem do agente" }), { target: { value: "Olá" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar" }));

    await waitFor(() => expect(screen.getByText("Resposta recuperada")).toBeInTheDocument());
    expect(agentClient.reconnectAgentTurn).toHaveBeenCalledWith("workspace-shared", "t3");
  });

  it("offers export and confirmed delete controls for transcript history", async () => {
    vi.mocked(agentClient.fetchAgentHistory).mockResolvedValue([{ id: "m1", actorId: "user-a", role: "user", content: "Mensagem" }]);
    vi.mocked(agentClient.exportAgentHistory).mockResolvedValue({ version: 1, exportedAt: "now", turns: [], messages: [], actions: [], events: [] });
    vi.mocked(agentClient.deleteAgentHistory).mockResolvedValue({ deleted: true, recordCount: 1 });
    vi.stubGlobal("confirm", vi.fn(() => true));

    render(<AgentTranscript open workspaceId="workspace-shared" />);
    expect(await screen.findByRole("button", { name: "Exportar histórico" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Exportar histórico" }));
    await waitFor(() => expect(agentClient.exportAgentHistory).toHaveBeenCalledWith("workspace-shared"));
    fireEvent.click(screen.getByRole("button", { name: "Excluir meu histórico" }));
    await waitFor(() => expect(agentClient.deleteAgentHistory).toHaveBeenCalledWith("workspace-shared"));
  });

  it("renders approve and reject actions for pending operations", async () => {
    vi.mocked(agentClient.fetchAgentHistory).mockResolvedValue([]);
    vi.mocked(agentClient.fetchPendingOperations).mockResolvedValue([{
      id: "pending-1", householdId: "workspace-shared", requesterId: "user-a", operation: "transactions.expense.create",
      payload: {}, reason: "high_value", idempotencyKey: "key-1", status: "pending", createdAt: "now", expiresAt: "later",
    }]);
    vi.mocked(agentClient.approvePendingOperation).mockResolvedValue({
      id: "pending-1", householdId: "workspace-shared", requesterId: "user-a", operation: "transactions.expense.create",
      payload: {}, reason: "high_value", idempotencyKey: "key-1", status: "approved", createdAt: "now", expiresAt: "later",
    });

    render(<AgentTranscript open workspaceId="workspace-shared" />);
    expect(await screen.findByText("Aprovação necessária")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Aprovar" }));
    await waitFor(() => expect(agentClient.approvePendingOperation).toHaveBeenCalledWith("workspace-shared", "pending-1"));
    expect(screen.queryByText("Aprovação necessária")).not.toBeInTheDocument();
  });

  it("sends, processes, reconnects and renders assistant output", async () => {
    vi.mocked(agentClient.fetchAgentHistory).mockResolvedValue([]);
    vi.mocked(agentClient.sendAgentMessage).mockResolvedValue({ turnId: "t1", status: "queued" });
    vi.mocked(agentClient.processAgentTurn).mockResolvedValue({ turnId: "t1", status: "completed", output: "Resposta do agente" });
    vi.mocked(agentClient.reconnectAgentTurn).mockResolvedValue([{ id: 1, type: "completed", data: "{}" }]);

    render(<AgentTranscript open workspaceId="workspace-shared" />);
    const input = await screen.findByRole("textbox", { name: "Mensagem do agente" });
    fireEvent.change(input, { target: { value: "Olá" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar" }));

    await waitFor(() => expect(screen.getByText("Resposta do agente")).toBeInTheDocument());
    expect(agentClient.processAgentTurn).toHaveBeenCalledWith("workspace-shared", "t1");
    expect(agentClient.reconnectAgentTurn).toHaveBeenCalledWith("workspace-shared", "t1");
  });
});
