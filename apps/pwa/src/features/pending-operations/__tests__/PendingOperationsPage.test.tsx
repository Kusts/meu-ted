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

import * as endpoints from "@/lib/api/endpoints";

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
});
