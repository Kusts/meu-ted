import { render, screen } from "@/lib/test-utils";
import AccountsPage from "../AccountsPage";
import * as appStateModule from "@/lib/state/app-state-context";
import { mockAccounts, mockCategories, ALL_MOCK_TRANSACTIONS, mockPayables, mockBudgets, mockGoals } from "@/lib/state/mock-data";
import type { AppState } from "@/lib/state/app-state-context";

function defaultState(): AppState {
  return {
    accounts: [...mockAccounts], categories: [...mockCategories],
    transactions: [...ALL_MOCK_TRANSACTIONS], payables: [...mockPayables],
    budgets: [...mockBudgets], goals: [...mockGoals],
    debts: [], subscriptions: [], loading: false, error: null,
    addTransaction: vi.fn(), deleteTransaction: vi.fn(), markPayablePaid: vi.fn(),
    cardStatements: [], writeError: null, clearWriteError: vi.fn(),
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
    addAccount: vi.fn(), addCategory: vi.fn(), addCard: vi.fn(), updateCard: vi.fn(),
    addSubscription: vi.fn(), cancelSubscription: vi.fn(),
    createTransfer: vi.fn(), payStatement: vi.fn(), createInstallments: vi.fn(),
  };
}
function mockState(o: Partial<AppState>): AppState { return { ...defaultState(), ...o }; }

describe("AccountsPage", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  describe("with data", () => {
    it("renders page header", () => { render(<AccountsPage />); expect(screen.getByText("Contas")).toBeInTheDocument(); });
    it("shows total balance", () => { render(<AccountsPage />); expect(screen.getByText(/2\.072,\d{2}/)).toBeInTheDocument(); });
    it("renders account names", () => { render(<AccountsPage />); expect(screen.getByText("Nubank")).toBeInTheDocument(); expect(screen.getByText("Itaú")).toBeInTheDocument(); expect(screen.getByText("Inter")).toBeInTheDocument(); });
    it("does not render credit cards", () => { render(<AccountsPage />); expect(screen.queryByText("Nubank Crédito")).not.toBeInTheDocument(); });
    it("shows individual balances", () => { render(<AccountsPage />); expect(screen.getByText(/1\.543,20/)).toBeInTheDocument(); expect(screen.getByText(/28,90/)).toBeInTheDocument(); expect(screen.getByText(/500,00/)).toBeInTheDocument(); });
    it("shows mini history", () => { render(<AccountsPage />); expect(screen.getByText("Supermercado Extra")).toBeInTheDocument(); expect(screen.getByText("Aluguel")).toBeInTheDocument(); });
  });

  describe("loading", () => {
    it("shows loading indicator", () => { vi.spyOn(appStateModule, "useAppState").mockReturnValue(mockState({ loading: true })); render(<AccountsPage />); expect(screen.getByText(/carregando/i)).toBeInTheDocument(); expect(screen.queryByText("Contas")).not.toBeInTheDocument(); });
  });

  describe("error", () => {
    it("shows error banner alongside data", () => { vi.spyOn(appStateModule, "useAppState").mockReturnValue(mockState({ error: "Offline" })); render(<AccountsPage />); expect(screen.getByText(/Offline/i)).toBeInTheDocument(); expect(screen.getByText("Contas")).toBeInTheDocument(); });
  });
});
