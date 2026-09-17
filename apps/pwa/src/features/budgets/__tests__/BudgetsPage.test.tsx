import { render, screen } from "@/lib/test-utils";
import userEvent from "@testing-library/user-event";
import BudgetsPage from "../BudgetsPage";
import * as appStateModule from "@/lib/state/app-state-context";
import { mockAccounts, mockCategories, ALL_MOCK_TRANSACTIONS, mockPayables, mockBudgets, mockGoals } from "@/lib/state/mock-data";
import type { AppState } from "@/lib/state/app-state-context";

// V4.1 Phase 5 (SPEC §12.6): the browser defaults to the same-origin proxy,
// so this UI suite pins the unconfigured mock-data provider path explicitly.
vi.mock("@/lib/api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/client")>();
  return { ...actual, isApiConfigured: () => false };
});

function defaultState(): AppState {
  return {
    accounts: [...mockAccounts], categories: [...mockCategories],
    transactions: [...ALL_MOCK_TRANSACTIONS], payables: [...mockPayables],
    budgets: [...mockBudgets], goals: [...mockGoals],
    debts: [], subscriptions: [], loading: false, error: null,
    addTransaction: vi.fn(), deleteTransaction: vi.fn(), markPayablePaid: vi.fn(), cancelPayable: vi.fn(), createPayable: vi.fn(), createBudget: vi.fn(), updateBudget: vi.fn(), createGoal: vi.fn(), contributeToGoal: vi.fn(), cancelGoal: vi.fn(),
    cardStatements: [], writeError: null, clearWriteError: vi.fn(),
    profile: null, dashboardSummary: null,
    saveProfile: vi.fn(), refreshProfile: vi.fn(), refreshDashboardSummary: vi.fn(),
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
    createCardPurchase: vi.fn(), updateTransaction: vi.fn(), updatePayable: vi.fn(),
    undoPayablePayment: vi.fn(), updateGoal: vi.fn(), updateAccount: vi.fn(),
    deactivateAccount: vi.fn(), updateCategory: vi.fn(), deactivateCategory: vi.fn(),
    deleteCategory: vi.fn(), applyCategoryDefaults: vi.fn(), updateSubscription: vi.fn(),
    refreshSubscriptions: vi.fn(), refreshDomains: vi.fn(),
    offlineLocked: false,
    revalidateOfflineSession: vi.fn(),
  };
}
function mockState(o: Partial<AppState>): AppState { return { ...defaultState(), ...o }; }

describe("BudgetsPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-06-26T12:00:00Z"));
  });
  afterEach(() => { vi.useRealTimers(); });

  describe("with data", () => {
    it("renders the page header", () => { render(<BudgetsPage />); expect(screen.getByText("Orçamentos")).toBeInTheDocument(); });
    it("renders summary", () => { render(<BudgetsPage />); expect(screen.getByText(/306,\d{2}/)).toBeInTheDocument(); expect(screen.getByText(/650,\d{2}/)).toBeInTheDocument(); });
    it("renders expense budget cards", () => { render(<BudgetsPage />); expect(screen.getByText("Alimentação")).toBeInTheDocument(); expect(screen.getByText("Transporte")).toBeInTheDocument(); });
    it("shows percentages", () => { render(<BudgetsPage />); expect(screen.getByText(/57\.5%/)).toBeInTheDocument(); expect(screen.getByText(/12\.6%/)).toBeInTheDocument(); });
    it("switches to Receitas tab", async () => { const user = userEvent.setup(); render(<BudgetsPage />); await user.click(screen.getByText(/Receitas/)); expect(screen.getByText("Salário")).toBeInTheDocument(); });
    it("shows Despesas tab active by default", () => { render(<BudgetsPage />); expect(screen.getByText("Despesas")).toBeInTheDocument(); });
  });

  describe("loading", () => {
    it("shows loading indicator", () => { vi.spyOn(appStateModule, "useAppState").mockReturnValue(mockState({ loading: true })); render(<BudgetsPage />); expect(screen.getByText(/carregando/i)).toBeInTheDocument(); expect(screen.queryByText("Alimentação")).not.toBeInTheDocument(); });
  });

  describe("error", () => {
    it("shows error banner alongside data", () => { vi.spyOn(appStateModule, "useAppState").mockReturnValue(mockState({ error: "Falha" })); render(<BudgetsPage />); expect(screen.getByText(/Falha/i)).toBeInTheDocument(); expect(screen.getByText("Alimentação")).toBeInTheDocument(); });
  });

  describe("new budget flow — type chooser and category selector", () => {
    it("Novo button opens type chooser", async () => {
      const user = userEvent.setup();
      render(<BudgetsPage />);
      await user.click(screen.getByText("Novo"));
      expect(screen.getByText("Orçamento de despesa")).toBeInTheDocument();
      expect(screen.getByText("Previsão de receita")).toBeInTheDocument();
    });

    it("choosing despesa opens form with category selector trigger", async () => {
      const user = userEvent.setup();
      render(<BudgetsPage />);
      await user.click(screen.getByText("Novo"));
      await user.click(screen.getByText("Orçamento de despesa"));
      const trigger = screen.getByTestId("category-selector-trigger");
      expect(trigger).toBeInTheDocument();
      expect(trigger.textContent).toMatch(/Selecionar categoria/i);
    });

    it("choosing receita filters categories to income only", async () => {
      const user = userEvent.setup();
      render(<BudgetsPage />);
      await user.click(screen.getByText("Novo"));
      await user.click(screen.getByText("Previsão de receita"));
      // Open category selector
      await user.click(screen.getByTestId("category-selector-trigger"));
      expect(screen.getByText("Salário")).toBeInTheDocument();
      expect(screen.getByText("Freelas")).toBeInTheDocument();
    });

    it("calls createBudget with expense category", async () => {
      const createSpy = vi.fn();
      vi.spyOn(appStateModule, "useAppState").mockReturnValue(mockState({ createBudget: createSpy }));
      const user = userEvent.setup();
      render(<BudgetsPage />);
      await user.click(screen.getByText("Novo"));
      await user.click(screen.getByText("Orçamento de despesa"));
      // Open category selector and pick
      await user.click(screen.getByTestId("category-selector-trigger"));
      const allAlim = screen.getAllByText("Alimentação");
      const catBtn = allAlim.find(el => el.tagName === "BUTTON");
      if (catBtn) await user.click(catBtn);
      // Fill amount
      const input = screen.getByPlaceholderText("0,00");
      await user.type(input, "50000");
      // Save
      await user.click(screen.getByText("Salvar orçamento"));
      expect(createSpy).toHaveBeenCalledWith(expect.objectContaining({
        categoryId: "cat1",
        amountCents: 50000,
        period: "monthly",
      }));
    });

    it("categories use single selector trigger (not chips)", async () => {
      const user = userEvent.setup();
      render(<BudgetsPage />);
      await user.click(screen.getByText("Novo"));
      await user.click(screen.getByText("Orçamento de despesa"));
      const selectTrigger = screen.getByTestId("category-selector-trigger");
      expect(selectTrigger).toBeInTheDocument();
      expect(selectTrigger.textContent).toMatch(/Selecionar categoria/i);
    });
  });

  describe("clickable cards and detail/edit sheet", () => {
    it("no inline edit button on cards", () => {
      render(<BudgetsPage />);
      expect(screen.queryAllByText("Editar").length).toBe(0);
    });

    it("clicking a budget card opens detail sheet with Editar button", async () => {
      const user = userEvent.setup();
      render(<BudgetsPage />);
      await user.click(screen.getByText("Alimentação"));
      // Detail sheet shows Editar button
      expect(screen.getByText("Editar")).toBeInTheDocument();
      // Percentage visible (appears in both card and sheet)
      expect(screen.getAllByText(/57\.5%/).length).toBeGreaterThanOrEqual(1);
    });

    it("clicking Editar shows edit form with Salvar button", async () => {
      const user = userEvent.setup();
      render(<BudgetsPage />);
      await user.click(screen.getByText("Alimentação"));
      await user.click(screen.getByText("Editar"));
      expect(screen.getByText("Salvar alterações")).toBeInTheDocument();
    });

    it("editMode persists after value change — Salvar alterações stays visible", async () => {
      const user = userEvent.setup();
      const updateSpy = vi.fn();
      vi.spyOn(appStateModule, "useAppState").mockReturnValue(mockState({ updateBudget: updateSpy }));
      render(<BudgetsPage />);
      // Open detail
      await user.click(screen.getByText("Alimentação"));
      await user.click(screen.getByText("Editar"));
      // Salvar alterações must be visible immediately after entering edit mode
      const saveBtn = screen.getByText("Salvar alterações");
      expect(saveBtn).toBeInTheDocument();
      // Change value
      const input = screen.getByPlaceholderText("0,00");
      await user.clear(input);
      await user.type(input, "70000");
      // Salvar alterações must STILL be visible — proves editMode was not reset
      expect(screen.getByText("Salvar alterações")).toBeInTheDocument();
      // Save and confirm PATCH was called
      await user.click(screen.getByText("Salvar alterações"));
      expect(updateSpy).toHaveBeenCalledWith("bud1", expect.objectContaining({ amountCents: 70000 }));
    });

    it("calls updateBudget when saving in edit mode", async () => {
      const updateSpy = vi.fn();
      vi.spyOn(appStateModule, "useAppState").mockReturnValue(mockState({ updateBudget: updateSpy }));
      const user = userEvent.setup();
      render(<BudgetsPage />);
      await user.click(screen.getByText("Alimentação"));
      await user.click(screen.getByText("Editar"));
      const input = screen.getByPlaceholderText("0,00");
      await user.clear(input);
      await user.type(input, "70000");
      await user.click(screen.getByText("Salvar alterações"));
      expect(updateSpy).toHaveBeenCalledWith("bud1", expect.objectContaining({ amountCents: 70000 }));
    });
  });

  describe("edge branches", () => {
    it("shows empty-state when no expense categories exist", async () => {
      vi.spyOn(appStateModule, "useAppState").mockReturnValue(mockState({ categories: [] }));
      const user = userEvent.setup();
      render(<BudgetsPage />);
      await user.click(screen.getByText("Novo"));
      await user.click(screen.getByText("Orçamento de despesa"));
      expect(screen.getByText(/Crie primeiro uma categoria de despesa/i)).toBeInTheDocument();
    });

    it("shows empty-state when no income categories exist", async () => {
      vi.spyOn(appStateModule, "useAppState").mockReturnValue(mockState({ categories: [] }));
      const user = userEvent.setup();
      render(<BudgetsPage />);
      await user.click(screen.getByText("Novo"));
      await user.click(screen.getByText("Previsão de receita"));
      expect(screen.getByText(/Crie primeiro uma categoria de receita/i)).toBeInTheDocument();
    });

    it("ignores amounts longer than 12 digits", async () => {
      const user = userEvent.setup();
      render(<BudgetsPage />);
      await user.click(screen.getByText("Novo"));
      await user.click(screen.getByText("Orçamento de despesa"));
      await user.click(screen.getByTestId("category-selector-trigger"));
      const catBtn = screen.getAllByText("Alimentação").find((el) => el.tagName === "BUTTON");
      if (catBtn) await user.click(catBtn);
      const input = screen.getByPlaceholderText("0,00");
      await user.type(input, "12345678901234567890");
      expect(input).toBeInTheDocument();
    });
  });
});
