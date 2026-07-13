import { render, screen, fireEvent } from "@/lib/test-utils";
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
    addAccount: vi.fn(), updateAccount: vi.fn(), deactivateAccount: vi.fn(),
    addCategory: vi.fn(), updateCategory: vi.fn(), deactivateCategory: vi.fn(),
    addCard: vi.fn(), updateCard: vi.fn(),
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
    it("shows mini history inside detail sheet when card is clicked", () => {
      render(<AccountsPage />);
      // First card is Nubank (acc1) — shows Supermercado Extra in mini history
      fireEvent.click(screen.getAllByTestId("account-card")[0]);
      expect(screen.getByText("Supermercado Extra")).toBeInTheDocument();
      // Aluguel is for Itaú (acc2) — should NOT be in Nubank's detail
      expect(screen.queryByText("Aluguel")).not.toBeInTheDocument();
    });
    it("shows account type labels", () => {
      render(<AccountsPage />);
      expect(screen.getAllByText("Conta corrente")).toHaveLength(2);
      expect(screen.getByText("Poupança")).toBeInTheDocument();
    });
    it("labels API-kind bank as Conta", () => {
      const bankAccount = { ...mockAccounts[0], kind: "bank" as const };
      vi.spyOn(appStateModule, "useAppState").mockReturnValue(mockState({
        accounts: [bankAccount],
        transactions: [],
      }));
      render(<AccountsPage />);
      expect(screen.getByText("Conta")).toBeInTheDocument();
      expect(screen.queryByText("Conta corrente")).not.toBeInTheDocument();
    });
    it("labels unknown kind as Outro", () => {
      const weirdAccount = { ...mockAccounts[0], kind: "unknown" as any };
      vi.spyOn(appStateModule, "useAppState").mockReturnValue(mockState({
        accounts: [weirdAccount],
        transactions: [],
      }));
      render(<AccountsPage />);
      expect(screen.getByText("Outro")).toBeInTheDocument();
      expect(screen.queryByText("Cartão")).not.toBeInTheDocument();
    });
  });

  describe("loading", () => {
    it("shows loading indicator", () => { vi.spyOn(appStateModule, "useAppState").mockReturnValue(mockState({ loading: true })); render(<AccountsPage />); expect(screen.getByText(/carregando/i)).toBeInTheDocument(); expect(screen.queryByText("Contas")).not.toBeInTheDocument(); });
  });

  describe("error", () => {
    it("shows error banner alongside data", () => { vi.spyOn(appStateModule, "useAppState").mockReturnValue(mockState({ error: "Offline" })); render(<AccountsPage />); expect(screen.getByText(/Offline/i)).toBeInTheDocument(); expect(screen.getByText("Contas")).toBeInTheDocument(); });
  });

  describe("account actions", () => {
    it("no inline edit/deactivate buttons on cards (actions inside detail sheet)", () => {
      render(<AccountsPage />);
      // Inline buttons must NOT exist. Only the card itself is clickable.
      expect(screen.queryAllByText("Editar").length).toBe(0);
      expect(screen.queryAllByText("Desativar").length).toBe(0);
    });

    it("clicking account card opens detail sheet", () => {
      render(<AccountsPage />);
      fireEvent.click(screen.getAllByTestId("account-card")[0]);
      // Detail sheet should show account name + actions
      expect(screen.getByText("Detalhes da conta")).toBeInTheDocument();
      expect(screen.getByText("Editar conta")).toBeInTheDocument();
      expect(screen.getByText("Desativar conta")).toBeInTheDocument();
    });

    it("opens edit sheet from detail sheet", () => {
      render(<AccountsPage />);
      fireEvent.click(screen.getAllByTestId("account-card")[0]);
      fireEvent.click(screen.getByText("Editar conta"));
      expect(screen.getByText("Salvar")).toBeInTheDocument();
    });

    it("detail sheet has 'Ver todos os registros' CTA linking to /registros?accountId=<id>", () => {
      render(<AccountsPage />);
      fireEvent.click(screen.getAllByTestId("account-card")[0]);
      const cta = screen.getByText("Ver todos os registros");
      expect(cta).toBeInTheDocument();
      expect(cta.closest("a")).toHaveAttribute("href", "/registros?accountId=acc1");
    });

    it("opens confirm dialog from detail sheet", async () => {
      render(<AccountsPage />);
      fireEvent.click(screen.getAllByTestId("account-card")[0]);
      fireEvent.click(screen.getByText("Desativar conta"));
      expect(await screen.findByText("Desativar")).toBeInTheDocument();
    });
  });

  describe("deep-link from Home (Slice A: ?accountId=)", () => {
    /**
     * Bug fix: Home now routes to /contas?accountId=<id> when the user
     * taps an account row. AccountsPage must reflect that context so the
     * user lands on the right account (highlighted/expanded).
     */
    function setUrlSearch(search: string) {
      Object.defineProperty(window, "location", {
        value: { ...window.location, search },
        writable: true,
        configurable: true,
      });
    }

    it("deep-link ?accountId opens the detail sheet for the matching account", () => {
      setUrlSearch("?accountId=acc1");
      render(<AccountsPage />);
      // Should open detail sheet automatically
      expect(screen.getByText("Detalhes da conta")).toBeInTheDocument();
    });

    it("does not open detail sheet when ?accountId is missing", () => {
      setUrlSearch("");
      render(<AccountsPage />);
      expect(screen.queryByText("Detalhes da conta")).not.toBeInTheDocument();
    });

    it("ignores ?accountId that does not match any account (no crash, no sheet)", () => {
      setUrlSearch("?accountId=acc-does-not-exist");
      render(<AccountsPage />);
      expect(screen.queryByText("Detalhes da conta")).not.toBeInTheDocument();
      expect(screen.getByText("Nubank")).toBeInTheDocument();
    });
  });
});
