import { render, screen, fireEvent } from "@/lib/test-utils";
import RecordsPage from "../RecordsPage";
import * as appStateModule from "@/lib/state/app-state-context";
import { mockAccounts, mockCategories, ALL_MOCK_TRANSACTIONS, mockPayables, mockBudgets, mockGoals } from "@/lib/state/mock-data";
import type { AppState } from "@/lib/state/app-state-context";

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
    cardStatements: [],
    loading: false,
    error: null,
    writeError: null,
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
    addTransaction: vi.fn(),
    deleteTransaction: vi.fn(),
    markPayablePaid: vi.fn(),
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

describe("RecordsPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("with data", () => {
    it("renders the page header", () => {
      render(<RecordsPage />);
      expect(screen.getByText("Registros")).toBeInTheDocument();
    });

    it("renders all transactions by default", () => {
      render(<RecordsPage />);
      expect(screen.getByText("Supermercado Extra")).toBeInTheDocument();
      expect(screen.getByText("Salário Junho")).toBeInTheDocument();
      expect(screen.getByText("PIX para Nubank")).toBeInTheDocument();
    });

    it("filters by type: only expenses", () => {
      render(<RecordsPage />);
      fireEvent.click(screen.getByText("Despesas"));
      expect(screen.getByText("Supermercado Extra")).toBeInTheDocument();
      expect(screen.queryByText("Salário Junho")).not.toBeInTheDocument();
      expect(screen.queryByText("PIX para Nubank")).not.toBeInTheDocument();
    });

    it("filters by type: only transfers", () => {
      render(<RecordsPage />);
      fireEvent.click(screen.getByText("Transf."));
      expect(screen.getByText("PIX para Nubank")).toBeInTheDocument();
      expect(screen.queryByText("Supermercado Extra")).not.toBeInTheDocument();
    });

    it("filters by period: 7d", () => {
      render(<RecordsPage />);
      fireEvent.click(screen.getByText("7d"));
      expect(screen.getByText("Supermercado Extra")).toBeInTheDocument();
      expect(screen.queryByText("Aluguel")).not.toBeInTheDocument();
      expect(screen.queryByText("Salário Junho")).not.toBeInTheDocument();
    });

    it("filters by search text", () => {
      render(<RecordsPage />);
      const searchInput = screen.getByPlaceholderText(/buscar/i);
      fireEvent.change(searchInput, { target: { value: "Uber" } });
      expect(screen.getByText("Uber para casa")).toBeInTheDocument();
      expect(screen.queryByText("Supermercado Extra")).not.toBeInTheDocument();
    });

    it("shows empty state when no results match", () => {
      render(<RecordsPage />);
      const searchInput = screen.getByPlaceholderText(/buscar/i);
      fireEvent.change(searchInput, { target: { value: "ZZZZNOTFOUND" } });
      expect(screen.getByText(/nada encontrado/i)).toBeInTheDocument();
    });

    it("groups transactions by date", () => {
      render(<RecordsPage />);
      expect(screen.getByText("Supermercado Extra")).toBeInTheDocument();
      expect(screen.getByText("Ifood")).toBeInTheDocument();
    });

    it("renders type filter chips", () => {
      render(<RecordsPage />);
      expect(screen.getByText("Tudo")).toBeInTheDocument();
      expect(screen.getByText("Despesas")).toBeInTheDocument();
      expect(screen.getByText("Receitas")).toBeInTheDocument();
      expect(screen.getByText("Transf.")).toBeInTheDocument();
    });

    it("renders period filter chips", () => {
      render(<RecordsPage />);
      expect(screen.getByText("7d")).toBeInTheDocument();
      expect(screen.getByText("30d")).toBeInTheDocument();
      expect(screen.getByText("90d")).toBeInTheDocument();
    });
  });

  describe("loading state", () => {
    it("shows loading indicator when loading", () => {
      vi.spyOn(appStateModule, "useAppState").mockReturnValue(mockState({ loading: true }));
      render(<RecordsPage />);
      expect(screen.getByText(/carregando/i)).toBeInTheDocument();
      expect(screen.queryByText("Supermercado Extra")).not.toBeInTheDocument();
    });
  });

  describe("error state", () => {
    it("shows error banner when error is set", () => {
      vi.spyOn(appStateModule, "useAppState").mockReturnValue(
        mockState({ error: "Erro de rede" }),
      );
      render(<RecordsPage />);
      expect(screen.getByText(/Erro de rede/i)).toBeInTheDocument();
      expect(screen.getByText("Supermercado Extra")).toBeInTheDocument();
    });
  });
});
