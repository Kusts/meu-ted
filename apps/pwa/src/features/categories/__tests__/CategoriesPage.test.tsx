import { render, screen, fireEvent } from "@/lib/test-utils";
import CategoriesPage from "../CategoriesPage";
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
    addAccount: vi.fn(), updateAccount: vi.fn(), deactivateAccount: vi.fn(),
    addCategory: vi.fn(), updateCategory: vi.fn(), deactivateCategory: vi.fn(),
    addCard: vi.fn(), updateCard: vi.fn(),
    addSubscription: vi.fn(), cancelSubscription: vi.fn(),
    createTransfer: vi.fn(), payStatement: vi.fn(), createInstallments: vi.fn(),
  };
}
function mockState(o: Partial<AppState>): AppState { return { ...defaultState(), ...o }; }

describe("CategoriesPage", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  describe("with data", () => {
    it("renders page header", () => { render(<CategoriesPage />); expect(screen.getByText("Categorias")).toBeInTheDocument(); });
    it("renders Despesas section", () => { render(<CategoriesPage />); expect(screen.getByText("Despesas")).toBeInTheDocument(); });
    it("renders Receitas section", () => { render(<CategoriesPage />); expect(screen.getByText("Receitas")).toBeInTheDocument(); });
    it("renders expense category names", () => { render(<CategoriesPage />); expect(screen.getByText("Alimentação")).toBeInTheDocument(); expect(screen.getByText("Transporte")).toBeInTheDocument(); expect(screen.getByText("Moradia")).toBeInTheDocument(); });
    it("renders income category names", () => { render(<CategoriesPage />); expect(screen.getByText("Salário")).toBeInTheDocument(); expect(screen.getByText("Freelas")).toBeInTheDocument(); });
    it("renders subcategory chips", () => { render(<CategoriesPage />); expect(screen.getByText("Mercado")).toBeInTheDocument(); expect(screen.getByText("Restaurante")).toBeInTheDocument(); expect(screen.getByText("Ifood")).toBeInTheDocument(); });
    it("renders + Sub buttons", () => { render(<CategoriesPage />); expect(screen.getAllByText("+ Sub").length).toBeGreaterThan(0); });
  });

  describe("loading", () => {
    it("shows loading indicator", () => { vi.spyOn(appStateModule, "useAppState").mockReturnValue(mockState({ loading: true })); render(<CategoriesPage />); expect(screen.getByText(/carregando/i)).toBeInTheDocument(); expect(screen.queryByText("Despesas")).not.toBeInTheDocument(); });
  });

  describe("error", () => {
    it("shows error banner alongside data", () => { vi.spyOn(appStateModule, "useAppState").mockReturnValue(mockState({ error: "API error" })); render(<CategoriesPage />); expect(screen.getByText(/API error/i)).toBeInTheDocument(); expect(screen.getByText("Despesas")).toBeInTheDocument(); });
  });

  describe("category actions", () => {
    it("shows edit and desativar buttons on each category", () => {
      render(<CategoriesPage />);
      expect(screen.getAllByText("Editar").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Desativar").length).toBeGreaterThan(0);
    });

    it("opens edit sheet when editar is clicked", () => {
      render(<CategoriesPage />);
      fireEvent.click(screen.getAllByText("Editar")[0]);
      expect(screen.getByText("Salvar")).toBeInTheDocument();
    });

    it("opens confirm dialog when desativar is clicked", async () => {
      render(<CategoriesPage />);
      expect(screen.getAllByText("Desativar").length).toBeGreaterThan(0);
      fireEvent.click(screen.getAllByText("Desativar")[0]);
      expect(await screen.findByText("Desativar categoria")).toBeInTheDocument();
    });
  });

  describe("visual", () => {
    it("renders category icons without emoji characters", () => {
      const { container } = render(<CategoriesPage />);
      // All SVG icons (no emoji spans with text-only content)
      const svgs = container.querySelectorAll("svg");
      expect(svgs.length).toBeGreaterThan(0);
      // No emoji spans with food/transport/heart characters
      const spans = container.querySelectorAll("span");
      for (const s of spans) {
        const txt = s.textContent ?? "";
        if (txt.length === 1 || txt.length === 2) {
          // Should not contain emoji codepoints
          const code = txt.codePointAt(0) ?? 0;
          expect(code).not.toBeGreaterThan(0x1f300); // below emoji range
        }
      }
    });
  });
});
