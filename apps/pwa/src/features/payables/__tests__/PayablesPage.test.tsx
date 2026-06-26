import { render, screen } from "@/lib/test-utils";
import userEvent from "@testing-library/user-event";
import PayablesPage from "../PayablesPage";
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
    loading: false,
    error: null,
    addTransaction: vi.fn(),
    deleteTransaction: vi.fn(),
    markPayablePaid: vi.fn(),
    cardStatements: [],
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

describe("PayablesPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("with data", () => {
    it("renders the page header", () => {
      render(<PayablesPage />);
      expect(screen.getByText("Contas a pagar")).toBeInTheDocument();
    });

    it("renders KPI totals", () => {
      render(<PayablesPage />);
      const totalMatches = screen.getAllByText(/2\.140,\d{2}/);
      expect(totalMatches.length).toBeGreaterThanOrEqual(1);
    });

    it("renders all payable descriptions", () => {
      render(<PayablesPage />);
      expect(screen.getByText("Luz")).toBeInTheDocument();
      expect(screen.getByText("Internet")).toBeInTheDocument();
      expect(screen.getByText("Aluguel")).toBeInTheDocument();
    });

    it("renders filter chips", () => {
      render(<PayablesPage />);
      expect(screen.getByText("Todas")).toBeInTheDocument();
      expect(screen.getByText("Próximas")).toBeInTheDocument();
      expect(screen.getByText("Vencidas")).toBeInTheDocument();
      expect(screen.getByText("Pagas")).toBeInTheDocument();
    });

    it("shows grouped sections", () => {
      render(<PayablesPage />);
      const vencidas = screen.getAllByText(/Vencidas/);
      expect(vencidas.length).toBeGreaterThanOrEqual(1);
      const proximas = screen.getAllByText(/Próximas/);
      expect(proximas.length).toBeGreaterThanOrEqual(1);
      const pagas = screen.getAllByText(/Pagas/);
      expect(pagas.length).toBeGreaterThanOrEqual(1);
    });

    it("shows Pago button for non-paid items only", () => {
      render(<PayablesPage />);
      const pagoBtns = screen.getAllByText(/✓ Pago/);
      expect(pagoBtns.length).toBe(3);
    });

    it("marks item as paid when Pago is clicked", async () => {
      const user = userEvent.setup();
      render(<PayablesPage />);

      const pagoBtns = screen.getAllByText(/✓ Pago/);
      await user.click(pagoBtns[0]);

      const remainingPago = screen.getAllByText(/✓ Pago/);
      expect(remainingPago.length).toBe(2);
    });

    it("filters: only overdue items show when Vencidas selected", async () => {
      const user = userEvent.setup();
      render(<PayablesPage />);

      await user.click(screen.getByText("Vencidas"));

      expect(screen.getByText("Luz")).toBeInTheDocument();
      expect(screen.getByText("Internet")).toBeInTheDocument();
      expect(screen.queryByText("Aluguel")).not.toBeInTheDocument();
    });
  });

  describe("loading state", () => {
    it("shows loading indicator when loading", () => {
      vi.spyOn(appStateModule, "useAppState").mockReturnValue(mockState({ loading: true }));
      render(<PayablesPage />);
      expect(screen.getByText(/carregando/i)).toBeInTheDocument();
      expect(screen.queryByText("Luz")).not.toBeInTheDocument();
    });
  });

  describe("error state", () => {
    it("shows error banner when error is set", () => {
      vi.spyOn(appStateModule, "useAppState").mockReturnValue(mockState({ error: "Timeout ao carregar" }));
      render(<PayablesPage />);
      expect(screen.getByText(/Timeout ao carregar/i)).toBeInTheDocument();
      expect(screen.getByText("Luz")).toBeInTheDocument();
    });
  });

  describe("dead CTA signals", () => {
    it("shows Em breve message when Nova conta is clicked", async () => {
      const user = userEvent.setup();
      render(<PayablesPage />);
      await user.click(screen.getByText("Nova"));
      expect(screen.getByText(/criação de contas em breve/i)).toBeInTheDocument();
    });
  });
});
