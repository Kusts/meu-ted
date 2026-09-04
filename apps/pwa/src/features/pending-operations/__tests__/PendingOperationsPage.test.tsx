import { render, screen, within, waitFor } from "@/lib/test-utils";
import userEvent from "@testing-library/user-event";
import PendingOperationsPage from "../PendingOperationsPage";
import type { PendingOperation } from "@/lib/state/types";

const refreshDomainsMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock("@/lib/state/app-state-context", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/state/app-state-context")>();
  return {
    ...actual,
    useAppState: () => ({ refreshDomains: refreshDomainsMock }),
  };
});

const mockOps: PendingOperation[] = [
  {
    id: "00000000-0000-4000-a000-000000000001",
    householdId: "h1",
    requesterId: "d1",
    operation: "delete_transaction",
    payload: { description: "Compra grande", amountCents: 500000 },
    reason: "high_value",
    idempotencyKey: "k1",
    status: "pending",
    createdAt: new Date(Date.now() - 5 * 60000).toISOString(),
    expiresAt: new Date(Date.now() + 25 * 60000).toISOString(),
  },
  {
    id: "00000000-0000-4000-a000-000000000002",
    householdId: "h1",
    requesterId: "d1",
    operation: "cancel_payable",
    payload: { description: "Aluguel" },
    reason: "destructive",
    idempotencyKey: "k2",
    status: "pending",
    createdAt: new Date(Date.now() - 2 * 60000).toISOString(),
    expiresAt: new Date(Date.now() + 28 * 60000).toISOString(),
  },
];

vi.mock("@/lib/api/endpoints", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/endpoints")>("@/lib/api/endpoints");
  return {
    ...actual,
    fetchPendingOperations: vi.fn(),
    approvePendingOperation: vi.fn(),
    rejectPendingOperation: vi.fn(),
  };
});

vi.mock("@/lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/client")>("@/lib/api/client");
  return { ...actual, isApiConfigured: vi.fn().mockReturnValue(true) };
});

import * as endpoints from "@/lib/api/endpoints";
import * as clientModule from "@/lib/api/client";

describe("PendingOperationsPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // re-mock after restore
    vi.spyOn(clientModule, "isApiConfigured").mockReturnValue(true);
    vi.mocked(endpoints.fetchPendingOperations).mockResolvedValue([...mockOps]);
    vi.mocked(endpoints.approvePendingOperation).mockResolvedValue({ ...mockOps[0]!, status: "approved" });
    vi.mocked(endpoints.rejectPendingOperation).mockResolvedValue({ ...mockOps[0]!, status: "rejected" });
  });

  it("renders loading then list with confirm/cancel actions", async () => {
    render(<PendingOperationsPage />);
    expect(screen.getByText(/Carregando/i)).toBeInTheDocument();
    expect(await screen.findByTestId("pending-list")).toBeInTheDocument();
    expect(screen.getByText("delete_transaction")).toBeInTheDocument();
    expect(screen.getByText("cancel_payable")).toBeInTheDocument();
    expect(screen.getByTestId(`approve-${mockOps[0]!.id}`)).toBeInTheDocument();
    expect(screen.getByTestId(`reject-${mockOps[0]!.id}`)).toBeInTheDocument();
  });

  it("shows empty state when no pending operations", async () => {
    vi.mocked(endpoints.fetchPendingOperations).mockResolvedValue([]);
    render(<PendingOperationsPage />);
    expect(await screen.findByTestId("pending-empty")).toBeInTheDocument();
    expect(screen.getByText(/Nenhuma operação pendente/i)).toBeInTheDocument();
  });

  it("shows error banner on fetch failure", async () => {
    vi.mocked(endpoints.fetchPendingOperations).mockRejectedValue(new Error("falha de rede"));
    render(<PendingOperationsPage />);
    expect(await screen.findByTestId("pending-error")).toBeInTheDocument();
    expect(screen.getByText(/falha de rede/i)).toBeInTheDocument();
  });

  it("confirms approve flow via dialog and removes item", async () => {
    const user = userEvent.setup();
    render(<PendingOperationsPage />);
    await screen.findByTestId("pending-list");
    await user.click(screen.getByTestId(`approve-${mockOps[0]!.id}`));
    // dialog opens
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/Confirmar operação/i)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: /Sim, confirmar/i }));
    expect(endpoints.approvePendingOperation).toHaveBeenCalledWith(mockOps[0]!.id);
    // item removed optimistic
    expect(screen.queryByText("delete_transaction")).not.toBeInTheDocument();
    expect(screen.getByText("cancel_payable")).toBeInTheDocument();
  });

  it("confirms reject flow via dialog and removes item", async () => {
    const user = userEvent.setup();
    render(<PendingOperationsPage />);
    await screen.findByTestId("pending-list");
    await user.click(screen.getByTestId(`reject-${mockOps[1]!.id}`));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/Cancelar operação/i)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: /Sim, cancelar/i }));
    expect(endpoints.rejectPendingOperation).toHaveBeenCalledWith(mockOps[1]!.id);
    expect(screen.queryByText("cancel_payable")).not.toBeInTheDocument();
  });

  it("refreshes affected domains after approving an operation", async () => {
    refreshDomainsMock.mockClear();
    const user = userEvent.setup();
    render(<PendingOperationsPage />);
    await screen.findByTestId("pending-list");
    await user.click(screen.getByTestId(`approve-${mockOps[0]!.id}`));
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: /Sim, confirmar/i }));
    await waitFor(() =>
      expect(refreshDomainsMock).toHaveBeenCalledWith(["accounts", "transactions", "payables"]),
    );
  });

  it("refreshes affected domains after rejecting an operation", async () => {
    refreshDomainsMock.mockClear();
    const user = userEvent.setup();
    render(<PendingOperationsPage />);
    await screen.findByTestId("pending-list");
    await user.click(screen.getByTestId(`reject-${mockOps[1]!.id}`));
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: /Sim, cancelar/i }));
    await waitFor(() =>
      expect(refreshDomainsMock).toHaveBeenCalledWith(["accounts", "transactions", "payables"]),
    );
  });

  it("shows warning when API not configured", async () => {
    vi.mocked(clientModule.isApiConfigured).mockReturnValue(false);
    render(<PendingOperationsPage />);
    expect(await screen.findByText(/API não configurada/i)).toBeInTheDocument();
  });

  it("renders reason badges and expiry info", async () => {
    render(<PendingOperationsPage />);
    await screen.findByTestId("pending-list");
    expect(screen.getByText("Valor alto")).toBeInTheDocument();
    expect(screen.getByText("Ação destrutiva")).toBeInTheDocument();
    expect(screen.getAllByText(/expira em/i).length).toBeGreaterThanOrEqual(2);
  });
});
