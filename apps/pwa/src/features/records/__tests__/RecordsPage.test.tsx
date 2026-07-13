import { render, screen, fireEvent } from "@/lib/test-utils";
import userEvent from "@testing-library/user-event";

const mockRouter = { push: vi.fn(), refresh: vi.fn() };
vi.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
}));

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
    updateTransaction: vi.fn(),
    deleteTransaction: vi.fn(),
    markPayablePaid: vi.fn(),
    cancelPayable: vi.fn(),
    createPayable: vi.fn(),
    createBudget: vi.fn(),
    updateBudget: vi.fn(),
    createGoal: vi.fn(),
    contributeToGoal: vi.fn(),
    cancelGoal: vi.fn(),
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
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-06-26T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
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

    it("filters by type: only expenses (via filter sheet)", () => {
      render(<RecordsPage />);
      fireEvent.click(screen.getByTestId("filter-trigger"));
      fireEvent.click(screen.getByText("Despesas"));
      expect(screen.getByText("Supermercado Extra")).toBeInTheDocument();
      expect(screen.queryByText("Salário Junho")).not.toBeInTheDocument();
      expect(screen.queryByText("PIX para Nubank")).not.toBeInTheDocument();
    });

    it("filters by type: only transfers (via filter sheet)", () => {
      render(<RecordsPage />);
      fireEvent.click(screen.getByTestId("filter-trigger"));
      fireEvent.click(screen.getByText("Transf."));
      expect(screen.getByText("PIX para Nubank")).toBeInTheDocument();
      expect(screen.queryByText("Supermercado Extra")).not.toBeInTheDocument();
    });

    it("filters by period 7d (via filter sheet)", () => {
      render(<RecordsPage />);
      fireEvent.click(screen.getByTestId("filter-trigger"));
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

    it("renders a compact filter trigger button", () => {
      render(<RecordsPage />);
      const trigger = screen.getByTestId("filter-trigger");
      expect(trigger).toBeInTheDocument();
      expect(trigger.textContent).toMatch(/Filtro/i);
    });

    it("clicking filter trigger opens a BottomSheet", () => {
      render(<RecordsPage />);
      fireEvent.click(screen.getByTestId("filter-trigger"));
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    it("filter sheet shows type, period with new options (Hoje, Este mes, Personalizado)", () => {
      render(<RecordsPage />);
      fireEvent.click(screen.getByTestId("filter-trigger"));
      expect(screen.getByText("Despesas")).toBeInTheDocument();
      expect(screen.getByText("Receitas")).toBeInTheDocument();
      expect(screen.getByText("Hoje")).toBeInTheDocument();
      expect(screen.getByText("Este mês")).toBeInTheDocument();
      expect(screen.getByText("Personalizado")).toBeInTheDocument();
    });

    it("category is shown as single selector trigger, not chips", () => {
      render(<RecordsPage />);
      fireEvent.click(screen.getByTestId("filter-trigger"));
      expect(screen.getByTestId("category-selector-trigger")).toBeInTheDocument();
      expect(screen.queryByText("Alimentação")).not.toBeInTheDocument();
    });

    it("category selector opens a list with Voltar, Todas as categorias and categories", () => {
      render(<RecordsPage />);
      fireEvent.click(screen.getByTestId("filter-trigger"));
      fireEvent.click(screen.getByTestId("category-selector-trigger"));
      expect(screen.getByText("Voltar")).toBeInTheDocument();
      expect(screen.getByText("Todas as categorias")).toBeInTheDocument();
      expect(screen.getByText("Alimentação")).toBeInTheDocument();
    });

    it("selecting a category filters results and shows badge", () => {
      render(<RecordsPage />);
      fireEvent.click(screen.getByTestId("filter-trigger"));
      fireEvent.click(screen.getByTestId("category-selector-trigger"));
      fireEvent.click(screen.getByText("Alimentação"));
      expect(screen.getByTestId("filter-trigger").textContent).toMatch(/Alimentação/);
      expect(screen.getByText("Supermercado Extra")).toBeInTheDocument();
      expect(screen.queryByText("Uber para casa")).not.toBeInTheDocument();
    });

    it("custom date inputs appear when Personalizado is selected", () => {
      render(<RecordsPage />);
      fireEvent.click(screen.getByTestId("filter-trigger"));
      fireEvent.click(screen.getByText("Personalizado"));
      expect(screen.getByText(/Data inicial/i)).toBeInTheDocument();
      expect(screen.getByText(/Data final/i)).toBeInTheDocument();
    });
  });

  describe("accountId filter from URL (?accountId=)", () => {
    function setUrlSearch(search: string) {
      Object.defineProperty(window, "location", {
        value: { ...window.location, search },
        writable: true,
        configurable: true,
      });
    }

    it("filters transactions by accountId when ?accountId= is in the URL", () => {
      setUrlSearch("?accountId=acc1");
      render(<RecordsPage />);
      // Nubank (acc1) transactions should be visible
      expect(screen.getByText("Supermercado Extra")).toBeInTheDocument();
      // Itaú (acc2) transactions should be filtered out
      expect(screen.queryByText("Aluguel")).not.toBeInTheDocument();
    });

    it("shows account name badge when account filter is active", () => {
      setUrlSearch("?accountId=acc1");
      render(<RecordsPage />);
      const trigger = screen.getByTestId("filter-trigger");
      expect(trigger.textContent).toMatch(/Nubank/);
    });

    it("shows all transactions when ?accountId is missing", () => {
      setUrlSearch("");
      render(<RecordsPage />);
      expect(screen.getByText("Supermercado Extra")).toBeInTheDocument();
      expect(screen.getByText("Aluguel")).toBeInTheDocument();
    });
  });

  describe("loading state", () => {
    it("shows loading skeleton elements when loading", () => {
      vi.spyOn(appStateModule, "useAppState").mockReturnValue(mockState({ loading: true }));
      const { container } = render(<RecordsPage />);
      const skeleton = container.querySelector('[role="status"]');
      expect(skeleton).toBeTruthy();
      expect(screen.queryByText("Supermercado Extra")).not.toBeInTheDocument();
    });
  });

  describe("row actions", () => {
    it("shows action sheet when a transaction row is clicked", () => {
      render(<RecordsPage />);
      fireEvent.click(screen.getByText("Supermercado Extra"));
      expect(screen.getByText("Editar")).toBeInTheDocument();
      expect(screen.getByText("Excluir")).toBeInTheDocument();
    });
  });

  describe("stale state", () => {
    it("shows stale banner when transactions are from snapshot (read-only)", () => {
      vi.spyOn(appStateModule, "useAppState").mockReturnValue(
        mockState({
          sync: {
            accounts: { source: "mock", syncedAt: null },
            categories: { source: "mock", syncedAt: null },
            transactions: {
              source: "snapshot",
              syncedAt: "2026-06-25T10:00:00.000Z",
            },
            payables: { source: "mock", syncedAt: null },
            budgets: { source: "mock", syncedAt: null },
            goals: { source: "mock", syncedAt: null },
            subscriptions: { source: "mock", syncedAt: null },
            cardStatements: { source: "mock", syncedAt: null },
          },
          readOnly: true,
        }),
      );
      render(<RecordsPage />);
      expect(screen.getByTestId("stale-banner")).toBeInTheDocument();
    });

    it("shows unavailable banner when transactions are unavailable", () => {
      vi.spyOn(appStateModule, "useAppState").mockReturnValue(
        mockState({
          sync: {
            accounts: { source: "mock", syncedAt: null },
            categories: { source: "mock", syncedAt: null },
            transactions: {
              source: "unavailable",
              syncedAt: null,
            },
            payables: { source: "mock", syncedAt: null },
            budgets: { source: "mock", syncedAt: null },
            goals: { source: "mock", syncedAt: null },
            subscriptions: { source: "mock", syncedAt: null },
            cardStatements: { source: "mock", syncedAt: null },
          },
          readOnly: true,
        }),
      );
      render(<RecordsPage />);
      expect(screen.getByText(/indisponível/i)).toBeInTheDocument();
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

  describe("edit sheet account selector includes cards", () => {
    it("account options show 'Cartão' prefix for credit cards", () => {
      render(<RecordsPage />);
      fireEvent.click(screen.getByText("Supermercado Extra"));
      fireEvent.click(screen.getByText("Editar"));
      const accountSelects = screen.getAllByRole("combobox");
      const acctSelect = accountSelects[accountSelects.length - 1] as HTMLSelectElement;
      const options = Array.from(acctSelect.options);
      const cardOption = options.find((o) => o.textContent?.includes("Cartão"));
      expect(cardOption).toBeTruthy();
    });

    it("account options show 'Conta' prefix for non-credit accounts", () => {
      render(<RecordsPage />);
      fireEvent.click(screen.getByText("Supermercado Extra"));
      fireEvent.click(screen.getByText("Editar"));
      const accountSelects = screen.getAllByRole("combobox");
      const acctSelect = accountSelects[accountSelects.length - 1] as HTMLSelectElement;
      const options = Array.from(acctSelect.options);
      const contaOption = options.find((o) => o.textContent?.startsWith("Conta"));
      expect(contaOption).toBeTruthy();
    });
  });
});
