import { render, screen } from "@/lib/test-utils";
import userEvent from "@testing-library/user-event";
import HomePage from "../HomePage";
import * as appStateModule from "@/lib/state/app-state-context";
import { mockAccounts, mockCategories, ALL_MOCK_TRANSACTIONS, mockPayables, mockBudgets, mockGoals } from "@/lib/state/mock-data";
import type { AppState } from "@/lib/state/app-state-context";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

function defaultState(): AppState {
  return {
    accounts: [...mockAccounts],
    categories: [...mockCategories],
    transactions: [...ALL_MOCK_TRANSACTIONS],
    payables: [...mockPayables],
    budgets: [...mockBudgets],
    goals: [...mockGoals],
    debts: [],
    subscriptions: [],
    loading: false,
    error: null,
    addTransaction: vi.fn(),
    deleteTransaction: vi.fn(),
    markPayablePaid: vi.fn(),
    cardStatements: [],
    writeError: null,
    clearWriteError: vi.fn(),
    addAccount: vi.fn(),
    addCategory: vi.fn(),
    addCard: vi.fn(),
    updateCard: vi.fn(),
    addSubscription: vi.fn(),
    cancelSubscription: vi.fn(),
    createTransfer: vi.fn(),
    payStatement: vi.fn(),
    createInstallments: vi.fn(),
  };
}

function mockState(overrides: Partial<AppState>): AppState {
  return { ...defaultState(), ...overrides };
}

describe("HomePage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // ── Normal render tests (real provider via test-utils) ──
  describe("with data", () => {
    it("renders hero card with total balance", () => {
      render(<HomePage />);
      expect(screen.getByText(/2\.072,\d{2}/)).toBeInTheDocument();
    });

    it("renders quick action buttons (Despesa/Receita/Transferir)", () => {
      render(<HomePage />);
      // Despesa and Receita appear in quick actions and in tabs of NewTransactionSheet (when opened)
      expect(screen.getAllByText("Despesa").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("Receita").length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText("Transferir")).toBeInTheDocument();
    });

    it("calls onNewTransaction when Despesa is clicked", async () => {
      const user = userEvent.setup();
      const onNewTransaction = vi.fn();
      render(<HomePage onNewTransaction={onNewTransaction} />);
      const buttons = screen.getAllByText("Despesa");
      await user.click(buttons[buttons.length - 1]);
      expect(onNewTransaction).toHaveBeenCalledWith("expense");
    });

    it("renders hero mini-stats", () => {
      render(<HomePage />);
      const receitas = screen.getAllByText("Receitas");
      expect(receitas.length).toBeGreaterThanOrEqual(1);
      const despesas = screen.getAllByText("Despesas");
      expect(despesas.length).toBeGreaterThanOrEqual(1);
      const resultados = screen.getAllByText("Resultado");
      expect(resultados.length).toBeGreaterThanOrEqual(1);
    });

    it("renders header greeting inside gradient", () => {
      render(<HomePage />);
      const greetings = screen.getAllByText(/Boa madrugada|Bom dia|Boa tarde|Boa noite/);
      expect(greetings.length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText("Marina")).toBeInTheDocument();
    });

    it("renders KPI values", () => {
      render(<HomePage />);
      const incomeMatches = screen.getAllByText(/6\.850,\d{2}/);
      expect(incomeMatches.length).toBeGreaterThanOrEqual(1);
      const expenseMatches = screen.getAllByText(/2\.819,\d{2}/);
      expect(expenseMatches.length).toBeGreaterThanOrEqual(1);
    });

    it("renders account names from state", () => {
      render(<HomePage />);
      expect(screen.getByText("Nubank")).toBeInTheDocument();
      expect(screen.getByText("Itaú")).toBeInTheDocument();
      expect(screen.getByText("Inter")).toBeInTheDocument();
    });

    it("renders month-over-month delta KPIs", () => {
      render(<HomePage />);
      expect(screen.getByText(/Receitas vs mês ant\./)).toBeInTheDocument();
      expect(screen.getByText(/Despesas vs mês ant\./)).toBeInTheDocument();
    });

    it("renders cartões section with card names", () => {
      render(<HomePage />);
      expect(screen.getByText("Cartões de crédito")).toBeInTheDocument();
      expect(screen.getByText("Nubank Crédito")).toBeInTheDocument();
      expect(screen.getByText("Inter Mastercard")).toBeInTheDocument();
    });

    it("renders contas a pagar section", () => {
      render(<HomePage />);
      expect(screen.getByText(/Contas a pagar/)).toBeInTheDocument();
      const totalMatches = screen.getAllByText(/2\.140,\d{2}/);
      expect(totalMatches.length).toBeGreaterThanOrEqual(1);
    });

    it("renders insights section", () => {
      render(<HomePage />);
      expect(screen.getByText("Insights")).toBeInTheDocument();
    });

    it("calculates savings rate insight", () => {
      render(<HomePage />);
      expect(screen.getByText(/58\.8%.*Excelente/)).toBeInTheDocument();
    });

    it("shows top expense category insight", () => {
      render(<HomePage />);
      expect(screen.getAllByText(/Moradia/).length).toBeGreaterThanOrEqual(1);
    });

    it("shows next accounts payable in insights", () => {
      render(<HomePage />);
      const luzMatches = screen.getAllByText(/Luz/);
      expect(luzMatches.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ── Loading state ──
  describe("loading state", () => {
    it("shows loading indicator when loading", () => {
      vi.spyOn(appStateModule, "useAppState").mockReturnValue(mockState({ loading: true }));
      render(<HomePage />);
      expect(screen.getByText(/carregando/i)).toBeInTheDocument();
      expect(screen.queryByText("Saldo total")).not.toBeInTheDocument();
    });
  });

  // ── Error state ──
  describe("error state", () => {
    it("shows error banner when error is set", () => {
      vi.spyOn(appStateModule, "useAppState").mockReturnValue(
        mockState({ error: "Falha ao carregar dados" }),
      );
      render(<HomePage />);
      expect(screen.getByText(/Falha ao carregar dados/i)).toBeInTheDocument();
    });

    it("still renders data alongside error banner", () => {
      vi.spyOn(appStateModule, "useAppState").mockReturnValue(
        mockState({ error: "API offline" }),
      );
      render(<HomePage />);
      expect(screen.getByText(/API offline/i)).toBeInTheDocument();
      expect(screen.getByText(/Saldo total/)).toBeInTheDocument();
    });
  });
});
