import { render, screen, fireEvent } from "@/lib/test-utils";
import WalletPage from "../WalletPage";
import * as appStateModule from "@/lib/state/app-state-context";
import { mockAccounts, mockCategories, ALL_MOCK_TRANSACTIONS, mockPayables, mockBudgets, mockGoals, mockDebts } from "@/lib/state/mock-data";
import type { CardStatement } from "@/lib/state/types";

const mockCardStatements: CardStatement[] = [
  {
    id: "stmt1",
    accountId: "acc4",
    cycleYearMonth: "2026-06",
    closingDate: "2026-06-15",
    dueDate: "2026-06-22",
    totalCents: 77740,
    paidCents: 0,
    status: "open",
  },
  {
    id: "stmt2",
    accountId: "acc5",
    cycleYearMonth: "2026-06",
    closingDate: "2026-06-10",
    dueDate: "2026-06-18",
    totalCents: 0,
    paidCents: 0,
    status: "open",
  },
  // Duplicate open statement for same card (regression: earlier cycle not closed)
  {
    id: "stmt3",
    accountId: "acc4",
    cycleYearMonth: "2026-05",
    closingDate: "2026-05-15",
    dueDate: "2026-05-22",
    totalCents: 15000,
    paidCents: 0,
    status: "open",
  },
];
import type { AppState } from "@/lib/state/app-state-context";

function defaultState(): AppState {
  return {
    accounts: [...mockAccounts], categories: [...mockCategories],
    transactions: [...ALL_MOCK_TRANSACTIONS], payables: [...mockPayables],
    budgets: [...mockBudgets], goals: [...mockGoals],
    debts: [...mockDebts], subscriptions: [], cardStatements: [...mockCardStatements],
    loading: false, error: null, writeError: null,
    clearWriteError: vi.fn(),
    sync: {
      accounts: { source: "mock", syncedAt: null },
      categories: { source: "mock", syncedAt: null },
      transactions: { source: "mock", syncedAt: null },
      payables: { source: "mock", syncedAt: null },
      budgets: { source: "mock", syncedAt: null },
      goals: { source: "mock", syncedAt: null },
      subscriptions: { source: "mock", syncedAt: null },
      cardStatements: { source: "mock", syncedAt: null },
    },
    readOnly: false,
    addTransaction: vi.fn(), deleteTransaction: vi.fn(), markPayablePaid: vi.fn(), cancelPayable: vi.fn(), createPayable: vi.fn(), createBudget: vi.fn(), updateBudget: vi.fn(), createGoal: vi.fn(), contributeToGoal: vi.fn(), cancelGoal: vi.fn(),
    addAccount: vi.fn(), addCategory: vi.fn(), addCard: vi.fn(), updateCard: vi.fn(),
    addSubscription: vi.fn(), cancelSubscription: vi.fn(),
    createTransfer: vi.fn(), payStatement: vi.fn(), createInstallments: vi.fn(),
  };
}
function mockState(o: Partial<AppState>): AppState { return { ...defaultState(), ...o }; }

describe("WalletPage", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  describe("with data", () => {
    beforeEach(() => {
      vi.spyOn(appStateModule, "useAppState").mockReturnValue(mockState({}));
    });
    it("renders hero title", () => {
      render(<WalletPage />);
      expect(screen.getByText("Patrimônio")).toBeInTheDocument();
    });
    it("renders Patrimônio líquido label", () => {
      render(<WalletPage />);
      expect(screen.getByText("Patrimônio líquido")).toBeInTheDocument();
    });
    it("renders net worth formatted in BRL", () => {
      render(<WalletPage />);
      expect(screen.getByText(/34\.205,\d{2}/)).toBeInTheDocument();
    });
    it("renders 4 mini-stats per mock spec", () => {
      render(<WalletPage />);
      expect(screen.getByText("Saldo em contas")).toBeInTheDocument();
      // "Reservas / Metas" appears in hero + section title
      expect(screen.getAllByText("Reservas / Metas").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("Faturas abertas").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("Dívidas").length).toBeGreaterThanOrEqual(1);
    });
    it("renders accounts section", () => {
      render(<WalletPage />);
      expect(screen.getByText("Nubank")).toBeInTheDocument();
      expect(screen.getByText("Itaú")).toBeInTheDocument();
      expect(screen.getByText("Inter")).toBeInTheDocument();
    });
    it("renders credit cards", () => {
      render(<WalletPage />);
      expect(screen.getAllByText("Nubank Crédito").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("Inter Mastercard").length).toBeGreaterThanOrEqual(1);
    });
    it("shows card statement amounts from cardStatements by accountId", () => {
      render(<WalletPage />);
      // 777,40 appears in: hero mini-stat + Nubank card detail + open statements section
      // Proves statements are tracked per-accountId (acc4→77740), not from raw txs
      expect(screen.getAllByText(/777,\d{2}/).length).toBeGreaterThanOrEqual(2);
    });
    it("shows Adicionar buttons for both sections", () => {
      render(<WalletPage />);
      const adds = screen.getAllByText(/Adicionar/);
      expect(adds.length).toBeGreaterThanOrEqual(2);
    });
    it("shows individual balances", () => {
      render(<WalletPage />);
      expect(screen.getByText(/1\.543,20/)).toBeInTheDocument();
      expect(screen.getByText(/28,90/)).toBeInTheDocument();
      expect(screen.getAllByText(/500,00/).length).toBeGreaterThanOrEqual(1);
    });

    it("lower section deduplicates open statements per card (same source as hero)", () => {
      render(<WalletPage />);
      // acc4 has TWO open stmts (stmt1:777,40 + stmt3:150,00). Only stmt1 should appear.
      const links = screen.getAllByRole("link");
      const acc4Links = links.filter(
        (l) => l.getAttribute("href")?.includes("cardId=acc4"),
      );
      // credit card row + lower section = 2 links (not 3+ with duplicate)
      expect(acc4Links).toHaveLength(2);
    });
  });

  // ── Clickable cards ─────────────────────────────────────
  it.each([
    { name: "Nubank", id: "acc1" },
    { name: "Itaú", id: "acc2" },
    { name: "Inter", id: "acc3" },
  ])("account card for $name links to /contas?accountId=$id", ({ id }) => {
    render(<WalletPage />);
    const links = screen.getAllByRole("link");
    const cardLink = links.find((l) => l.getAttribute("href") === `/contas?accountId=${id}`);
    expect(cardLink).toBeDefined();
  });

  it.each([
    { name: "Nubank Crédito", id: "acc4" },
    { name: "Inter Mastercard", id: "acc5" },
  ])("credit card for $name links to /cartoes?cardId=$id", ({ name, id }) => {
    render(<WalletPage />);
    const link = screen.getByRole("link", { name: new RegExp(name, "i") });
    expect(link).toHaveAttribute("href", `/cartoes?cardId=${id}`);
  });

  // ── Reservas / Metas ────────────────────────────────────
  it("shows Reservas / Metas section with goals", () => {
    render(<WalletPage />);
    expect(screen.getByText("Reserva de emergência")).toBeInTheDocument();
    expect(screen.getByText("Viagem fim de ano")).toBeInTheDocument();
    expect(screen.getByText("Ver metas")).toBeInTheDocument();
  });

  it("shows goal progress amounts", () => {
    render(<WalletPage />);
    // formatBRL divides cents by 100: 150000 → "R$ 1.500,00", 600000 → "R$ 6.000,00"
    expect(screen.getByText(/1\.500,\d{2}/)).toBeInTheDocument();
    expect(screen.getAllByText(/6\.000,\d{2}/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/800,\d{2}/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/3\.000,\d{2}/)).toBeInTheDocument();
  });

  // ── Faturas abertas ─────────────────────────────────────
  it.each([
    { id: "acc4", name: "Nubank Crédito" },
  ])("shows open statement section for $name", ({ name, id }) => {
    render(<WalletPage />);
    const link = screen.getByRole("link", { name: new RegExp(name, "i") });
    expect(link).toHaveAttribute("href", `/cartoes?cardId=${id}`);
  });



  // ── Dívidas ────────────────────────────────────────────
  it("shows Dívidas section with debt items", () => {
    render(<WalletPage />);
    expect(screen.getByText("Financiamento Carro")).toBeInTheDocument();
    expect(screen.getByText("Curso Online")).toBeInTheDocument();
  });

  it("shows remaining amounts for each debt", () => {
    render(<WalletPage />);
    // formatBRL divides cents by 100:
    // Financiamento Carro: 3.600.000 → "R$ 36.000,00"
    // Curso Online: 180.000 → "R$ 1.800,00"
    expect(screen.getByText(/36\.000,\d{2}/)).toBeInTheDocument();
    expect(screen.getByText(/1\.800,\d{2}/)).toBeInTheDocument();
  });

  describe("loading", () => {
    it("shows loading indicator", () => {
      vi.spyOn(appStateModule, "useAppState").mockReturnValue(mockState({ loading: true }));
      render(<WalletPage />);
      expect(screen.getByText(/carregando/i)).toBeInTheDocument();
      expect(screen.queryByText("Patrimônio líquido")).not.toBeInTheDocument();
    });
  });

  describe("error", () => {
    it("shows error banner alongside data", () => {
      vi.spyOn(appStateModule, "useAppState").mockReturnValue(mockState({ error: "Rede offline" }));
      render(<WalletPage />);
      expect(screen.getByText(/Rede offline/i)).toBeInTheDocument();
      expect(screen.getByText("Patrimônio líquido")).toBeInTheDocument();
    });
  });
});
describe("WalletPage — P2-5 (banners de erro/stale)", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it("shows the write error banner and dismisses it", () => {
    const clearSpy = vi.fn();
    vi.spyOn(appStateModule, "useAppState").mockReturnValue(
      mockState({ writeError: "Falha ao salvar lançamento", clearWriteError: clearSpy }),
    );
    render(<WalletPage />);
    expect(screen.getByTestId("write-error-banner")).toHaveTextContent("Falha ao salvar lançamento");
    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
    expect(clearSpy).toHaveBeenCalledTimes(1);
  });

  it("shows the stale banner when a dependent domain is served from snapshot", () => {
    vi.spyOn(appStateModule, "useAppState").mockReturnValue(
      mockState({
        sync: {
          accounts: { source: "snapshot", syncedAt: "2026-09-01" },
          categories: { source: "mock", syncedAt: null },
          transactions: { source: "mock", syncedAt: null },
          payables: { source: "mock", syncedAt: null },
          budgets: { source: "mock", syncedAt: null },
          goals: { source: "mock", syncedAt: null },
          subscriptions: { source: "mock", syncedAt: null },
          cardStatements: { source: "mock", syncedAt: null },
        },
      }),
    );
    render(<WalletPage />);
    expect(screen.getByTestId("stale-banner")).toBeInTheDocument();
  });
});
