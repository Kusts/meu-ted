import { render, screen } from "@/lib/test-utils";
import userEvent from "@testing-library/user-event";
import BudgetsPage from "../BudgetsPage";
import * as appStateModule from "@/lib/state/app-state-context";
import { mockAccounts, mockCategories, ALL_MOCK_TRANSACTIONS, mockPayables, mockBudgets, mockGoals } from "@/lib/state/mock-data";
import type { AppState } from "@/lib/state/app-state-context";

function defaultState(): AppState {
  return {
    accounts: [...mockAccounts], categories: [...mockCategories],
    transactions: [...ALL_MOCK_TRANSACTIONS], payables: [...mockPayables],
    budgets: [...mockBudgets], goals: [...mockGoals],
    debts: [], subscriptions: [], loading: false, error: null,
    addTransaction: vi.fn(), deleteTransaction: vi.fn(), markPayablePaid: vi.fn(), cancelPayable: vi.fn(), createPayable: vi.fn(), createBudget: vi.fn(), updateBudget: vi.fn(), createGoal: vi.fn(), contributeToGoal: vi.fn(), cancelGoal: vi.fn(),
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

describe("BudgetsPage", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  describe("with data", () => {
    it("renders the page header", () => { render(<BudgetsPage />); expect(screen.getByText("Orçamentos")).toBeInTheDocument(); });
    it("renders summary", () => { render(<BudgetsPage />); expect(screen.getByText(/329,\d{2}/)).toBeInTheDocument(); expect(screen.getByText(/650,\d{2}/)).toBeInTheDocument(); });
    it("renders expense budget cards", () => { render(<BudgetsPage />); expect(screen.getByText("Alimentação")).toBeInTheDocument(); expect(screen.getByText("Transporte")).toBeInTheDocument(); });
    it("shows percentages", () => { render(<BudgetsPage />); expect(screen.getByText(/58\.4%/)).toBeInTheDocument(); expect(screen.getByText(/24\.8%/)).toBeInTheDocument(); });
    it("shows progress bar", () => { render(<BudgetsPage />); expect(screen.getByText(/58\.4%/)).toBeInTheDocument(); expect(screen.getByText(/24\.8%/)).toBeInTheDocument(); });
    it("switches to Receitas tab", async () => { const user = userEvent.setup(); render(<BudgetsPage />); await user.click(screen.getByText(/Receitas/)); expect(screen.getByText("Salário")).toBeInTheDocument(); });
    it("shows Despesas tab active by default", () => { render(<BudgetsPage />); expect(screen.getByText("Despesas")).toBeInTheDocument(); });
  });

  describe("loading", () => {
    it("shows loading indicator", () => { vi.spyOn(appStateModule, "useAppState").mockReturnValue(mockState({ loading: true })); render(<BudgetsPage />); expect(screen.getByText(/carregando/i)).toBeInTheDocument(); expect(screen.queryByText("Alimentação")).not.toBeInTheDocument(); });
  });

  describe("error", () => {
    it("shows error banner alongside data", () => { vi.spyOn(appStateModule, "useAppState").mockReturnValue(mockState({ error: "Falha" })); render(<BudgetsPage />); expect(screen.getByText(/Falha/i)).toBeInTheDocument(); expect(screen.getByText("Alimentação")).toBeInTheDocument(); });
  });
});
