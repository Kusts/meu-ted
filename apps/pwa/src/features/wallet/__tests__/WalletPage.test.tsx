import { render, screen } from "@/lib/test-utils";
import WalletPage from "../WalletPage";
import * as appStateModule from "@/lib/state/app-state-context";
import { mockAccounts, mockCategories, ALL_MOCK_TRANSACTIONS, mockPayables, mockBudgets, mockGoals, mockDebts } from "@/lib/state/mock-data";
import type { AppState } from "@/lib/state/app-state-context";

function defaultState(): AppState {
  return {
    accounts: [...mockAccounts], categories: [...mockCategories],
    transactions: [...ALL_MOCK_TRANSACTIONS], payables: [...mockPayables],
    budgets: [...mockBudgets], goals: [...mockGoals],
    debts: [...mockDebts], subscriptions: [], cardStatements: [],
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
    addTransaction: vi.fn(), deleteTransaction: vi.fn(), markPayablePaid: vi.fn(),
    addAccount: vi.fn(), addCategory: vi.fn(), addCard: vi.fn(), updateCard: vi.fn(),
    addSubscription: vi.fn(), cancelSubscription: vi.fn(),
    createTransfer: vi.fn(), payStatement: vi.fn(), createInstallments: vi.fn(),
  };
}
function mockState(o: Partial<AppState>): AppState { return { ...defaultState(), ...o }; }

describe("WalletPage", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  describe("with data", () => {
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
      expect(screen.getByText(/33\.657,\d{2}/)).toBeInTheDocument();
    });
    it("renders 4 mini-stats per mock spec", () => {
      render(<WalletPage />);
      expect(screen.getByText("Saldo em contas")).toBeInTheDocument();
      expect(screen.getByText("Reservas / Metas")).toBeInTheDocument();
      expect(screen.getByText("Faturas abertas")).toBeInTheDocument();
      expect(screen.getByText("Dívidas")).toBeInTheDocument();
    });
    it("renders accounts section", () => {
      render(<WalletPage />);
      expect(screen.getByText("Nubank")).toBeInTheDocument();
      expect(screen.getByText("Itaú")).toBeInTheDocument();
      expect(screen.getByText("Inter")).toBeInTheDocument();
    });
    it("renders credit cards", () => {
      render(<WalletPage />);
      expect(screen.getByText("Nubank Crédito")).toBeInTheDocument();
      expect(screen.getByText("Inter Mastercard")).toBeInTheDocument();
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
      expect(screen.getByText(/500,00/)).toBeInTheDocument();
    });
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