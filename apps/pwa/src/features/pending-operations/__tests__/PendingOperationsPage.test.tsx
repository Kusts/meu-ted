import { render, screen, waitFor } from "@/lib/test-utils";
import userEvent from "@testing-library/user-event";
import PendingOperationsPage from "../PendingOperationsPage";

vi.mock("@/lib/api/endpoints", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/endpoints")>("@/lib/api/endpoints");
  return {
    ...actual,
    undoLastAction: vi.fn(),
  };
});

const { reconcileMutationMock } = vi.hoisted(() => ({
  reconcileMutationMock: vi.fn(async () => ({
    targets: [],
    refreshed: [],
    failed: [],
    deduped: false,
  })),
}));

vi.mock("@/lib/state/app-state-context", async () => {
  const actual = await vi.importActual<typeof import("@/lib/state/app-state-context")>(
    "@/lib/state/app-state-context",
  );
  return {
    ...actual,
    useOptionalAppState: () => ({ reconcileMutation: reconcileMutationMock }),
  };
});

import * as endpoints from "@/lib/api/endpoints";

const UNDO_RECEIPT = {
  mutationId: "22222222-2222-4222-8222-222222222222",
  mutationKind: "transaction.delete",
  status: "succeeded",
  affectedTargets: ["transactions", "accounts", "dashboard-summary", "budgets", "quick-insights"],
} as const;

describe("PendingOperationsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("directs approval decisions to TED without rendering legacy controls", () => {
    render(<PendingOperationsPage />);
    expect(screen.getByTestId("pending-v2-info")).toHaveTextContent("no TED");
    expect(screen.queryByRole("button", { name: /confirmar/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /cancelar/i })).not.toBeInTheDocument();
  });

  it("keeps undo as a separate action", async () => {
    vi.mocked(endpoints.undoLastAction).mockResolvedValue({
      undone: { operation: "transactions.expense.create", entityId: "tx-1", reversal: "transaction.delete" },
    });
    const user = userEvent.setup();
    render(<PendingOperationsPage />);
    await user.click(screen.getByTestId("undo-last-action"));

    await waitFor(() => {
      expect(endpoints.undoLastAction).toHaveBeenCalledOnce();
    });
    expect(screen.getByTestId("undo-success")).toHaveTextContent("transactions.expense.create");
  });

  it("forwards the undo receipt to the reconciler (receipt wins, no kind fallback)", async () => {
    vi.mocked(endpoints.undoLastAction).mockResolvedValue({
      undone: { operation: "transactions.expense.create", entityId: "tx-1", reversal: "transaction.delete" },
      receipt: UNDO_RECEIPT,
    } as never);
    const user = userEvent.setup();
    render(<PendingOperationsPage />);
    await user.click(screen.getByTestId("undo-last-action"));

    await waitFor(() => {
      expect(reconcileMutationMock).toHaveBeenCalledWith({ receipt: UNDO_RECEIPT });
    });
    expect(reconcileMutationMock).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("undo-success")).toHaveTextContent("transactions.expense.create");
  });

  it("falls back to the reversal kind when the undo carries no receipt", async () => {
    vi.mocked(endpoints.undoLastAction).mockResolvedValue({
      undone: { operation: "transactions.expense.create", entityId: "tx-1", reversal: "transaction.delete" },
    });
    const user = userEvent.setup();
    render(<PendingOperationsPage />);
    await user.click(screen.getByTestId("undo-last-action"));

    await waitFor(() => {
      expect(reconcileMutationMock).toHaveBeenCalledWith({ mutationKind: "transaction.delete" });
    });
    expect(screen.getByTestId("undo-success")).toHaveTextContent("transactions.expense.create");
  });

  it("keeps the undo result when reconciliation fails (stale is honest, never a rollback)", async () => {
    vi.mocked(endpoints.undoLastAction).mockResolvedValue({
      undone: { operation: "transactions.expense.create", entityId: "tx-1", reversal: "transaction.delete" },
      receipt: UNDO_RECEIPT,
    } as never);
    reconcileMutationMock.mockRejectedValueOnce(new Error("refresh boom"));
    const user = userEvent.setup();
    render(<PendingOperationsPage />);
    await user.click(screen.getByTestId("undo-last-action"));

    await waitFor(() => {
      expect(reconcileMutationMock).toHaveBeenCalledWith({ receipt: UNDO_RECEIPT });
    });
    // The undo itself succeeded — a refresh failure must not roll it back.
    expect(screen.getByTestId("undo-success")).toHaveTextContent("transactions.expense.create");
    expect(screen.queryByTestId("undo-error")).not.toBeInTheDocument();
  });
});
