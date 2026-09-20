import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@/lib/test-utils";
import userEvent from "@testing-library/user-event";
import { TedUndoCard } from "../TedUndoCard";
import * as agentClient from "@/lib/api/agent-client";

vi.mock("@/lib/api/agent-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/agent-client")>();
  return { ...actual, decideUndoProposal: vi.fn() };
});

const PROPOSAL = {
  requestId: "proposal-1",
  status: "proposed" as const,
  expiresAt: "2026-09-19T12:00:00.000Z",
};

describe("TedUndoCard (debt-undo-confirmation-ui)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the safe summary and expiry without inventing target details", () => {
    render(<TedUndoCard proposal={PROPOSAL} workspaceId="ws-1" />);

    expect(screen.getByTestId("ted-undo-card")).toBeInTheDocument();
    expect(screen.getByText(/Desfazer última ação/)).toBeInTheDocument();
    expect(screen.getByText(/Válido até/)).toBeInTheDocument();
    // Fixed safe copy — no server-side target id leaks into the card.
    expect(screen.queryByText(/proposal-1/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirmar desfazer" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeInTheDocument();
  });

  it("confirm calls the RPC with (workspaceId, proposalId, confirm) and shows success", async () => {
    const user = userEvent.setup();
    const onResolved = vi.fn();
    vi.mocked(agentClient.decideUndoProposal).mockResolvedValue({
      requestId: "proposal-1",
      status: "confirmed",
    });

    render(<TedUndoCard proposal={PROPOSAL} workspaceId="ws-1" onResolved={onResolved} />);

    await user.click(screen.getByRole("button", { name: "Confirmar desfazer" }));

    await waitFor(() =>
      expect(agentClient.decideUndoProposal).toHaveBeenCalledWith("ws-1", "proposal-1", "confirm"),
    );
    expect(await screen.findByTestId("ted-undo-confirmed")).toHaveTextContent("Ação desfeita");
    expect(screen.queryByRole("button", { name: "Confirmar desfazer" })).not.toBeInTheDocument();
    expect(onResolved).toHaveBeenCalledWith({ requestId: "proposal-1", status: "confirmed" });
  });

  it("cancel calls the RPC with cancel and shows the cancelled state", async () => {
    const user = userEvent.setup();
    vi.mocked(agentClient.decideUndoProposal).mockResolvedValue({
      requestId: "proposal-1",
      status: "cancelled",
    });

    render(<TedUndoCard proposal={PROPOSAL} workspaceId="ws-1" />);

    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    await waitFor(() =>
      expect(agentClient.decideUndoProposal).toHaveBeenCalledWith("ws-1", "proposal-1", "cancel"),
    );
    expect(await screen.findByTestId("ted-undo-cancelled")).toHaveTextContent("nada foi alterado");
  });

  it("disables both buttons while the request is in flight", async () => {
    let resolveRpc!: (value: { requestId: string; status: "confirmed" }) => void;
    vi.mocked(agentClient.decideUndoProposal).mockReturnValue(
      new Promise((resolve) => {
        resolveRpc = resolve;
      }),
    );

    render(<TedUndoCard proposal={PROPOSAL} workspaceId="ws-1" />);

    fireEvent.click(screen.getByRole("button", { name: "Confirmar desfazer" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Processando…" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Cancelar" })).toBeDisabled();
    });

    resolveRpc({ requestId: "proposal-1", status: "confirmed" });
    expect(await screen.findByTestId("ted-undo-confirmed")).toBeInTheDocument();
  });

  it("failure keeps the card actionable with an honest error (no invented state)", async () => {
    const user = userEvent.setup();
    vi.mocked(agentClient.decideUndoProposal).mockRejectedValueOnce(new Error("rede caiu"));

    render(<TedUndoCard proposal={PROPOSAL} workspaceId="ws-1" />);

    await user.click(screen.getByRole("button", { name: "Confirmar desfazer" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("rede caiu");
    // Still proposed: the user can retry — never a fake terminal state.
    expect(screen.getByTestId("ted-undo-card")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirmar desfazer" })).toBeInTheDocument();
    expect(screen.queryByTestId("ted-undo-confirmed")).not.toBeInTheDocument();
  });

  it("a rapid double-click issues exactly one RPC (no local double-confirm)", async () => {
    let resolveRpc!: (value: { requestId: string; status: "confirmed" }) => void;
    vi.mocked(agentClient.decideUndoProposal).mockReturnValue(
      new Promise((resolve) => {
        resolveRpc = resolve;
      }),
    );

    render(<TedUndoCard proposal={PROPOSAL} workspaceId="ws-1" />);

    const confirm = screen.getByRole("button", { name: "Confirmar desfazer" });
    fireEvent.click(confirm);
    fireEvent.click(confirm);

    resolveRpc({ requestId: "proposal-1", status: "confirmed" });
    await screen.findByTestId("ted-undo-confirmed");
    expect(agentClient.decideUndoProposal).toHaveBeenCalledTimes(1);
  });
});
