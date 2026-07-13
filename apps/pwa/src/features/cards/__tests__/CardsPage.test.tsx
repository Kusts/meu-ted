import { render, screen, waitFor } from "@/lib/test-utils";
import userEvent from "@testing-library/user-event";
import CardsPage from "../CardsPage";
import * as appStateModule from "@/lib/state/app-state-context";
import * as endpoints from "@/lib/api/endpoints";
import { mockAccounts, mockCategories, ALL_MOCK_TRANSACTIONS, mockPayables, mockBudgets, mockGoals } from "@/lib/state/mock-data";
import type { AppState } from "@/lib/state/app-state-context";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

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

describe("CardsPage", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  describe("with data", () => {
    it("renders the page header", () => { render(<CardsPage />); expect(screen.getByText("Cartões")).toBeInTheDocument(); });
    it("renders credit card names", () => { render(<CardsPage />); expect(screen.getByText("Nubank Crédito")).toBeInTheDocument(); expect(screen.getByText("Inter Mastercard")).toBeInTheDocument(); });
    it("shows closing and due days", () => { render(<CardsPage />); expect(screen.getAllByText(/Fecha dia/).length).toBe(2); expect(screen.getAllByText(/vence dia/i).length).toBe(2); });
    it("shows current fatura total per card", () => { render(<CardsPage />); expect(screen.getByText(/41,80/)).toBeInTheDocument(); const inter = screen.getAllByText(/187,50/); expect(inter.length).toBeGreaterThanOrEqual(1); });
    it("shows purchases when drilling into card", async () => {
      const user = userEvent.setup();
      render(<CardsPage />);
      await user.click(screen.getByText("Nubank Crédito"));
      expect(screen.getByText("App Store")).toBeInTheDocument();
      const backBtn = screen.getByRole("button", { name: /cartões/i });
      await user.click(backBtn);
      expect(screen.getByText("Inter Mastercard")).toBeInTheDocument();
    });
    it("shows limit usage percentage", () => { render(<CardsPage />); expect(screen.getByText(/0\.3%/)).toBeInTheDocument(); expect(screen.getByText(/2\.3%/)).toBeInTheDocument(); });
    it("shows available limit for each card", () => { render(<CardsPage />); expect(screen.getAllByText(/livre/).length).toBe(2); });
    it("shows pagar fatura button in card detail", async () => {
      const user = userEvent.setup();
      render(<CardsPage />);
      await user.click(screen.getByText("Nubank Crédito"));
      expect(screen.getByText(/pagar fatura/i)).toBeInTheDocument();
    });
  });

  // ── Card creation ──
  describe("creating a card", () => {
    it("calls addCard with form data when saving", async () => {
      const addSpy = vi.fn();
      vi.spyOn(appStateModule, "useAppState").mockReturnValue(mockState({ addCard: addSpy }));
      const user = userEvent.setup();
      render(<CardsPage />);
      await user.click(screen.getByText("Novo"));
      // Fill limit
      const limitInput = screen.getByPlaceholderText("0,00");
      await user.type(limitInput, "500000");
      // Click save
      await user.click(screen.getByRole("button", { name: "Salvar cartão" }));
      expect(addSpy).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Nubank", creditLimitCents: 500000 }),
      );
    });
  });

  // ── Paying a statement ──
  describe("paying a statement", () => {
    it("calls payStatement when paying full", async () => {
      const paySpy = vi.fn();
      vi.spyOn(appStateModule, "useAppState").mockReturnValue(
        mockState({ payStatement: paySpy, cardStatements: [{ id: "stmt-1", accountId: "acc4", cycleYearMonth: "2026-06", closingDate: "2026-06-15", dueDate: "2026-06-25", totalCents: 4180, paidCents: 0, status: "open" }] }),
      );
      const user = userEvent.setup();
      render(<CardsPage />);
      // Drill into Nubank Crédito
      await user.click(screen.getByText("Nubank Crédito"));
      // Click Pagar fatura
      await user.click(screen.getByText(/pagar fatura/i));
      // Select account Nubank (checking)
      const nubankBtns = screen.getAllByText("Nubank");
      // The PayStatementSheet has Nubank as an account option; click the account picker one
      await user.click(nubankBtns[nubankBtns.length - 1]);
      // Click "Pagar fatura total"
      await user.click(screen.getByRole("button", { name: /Pagar fatura total/i }));
      expect(paySpy).toHaveBeenCalledWith("stmt-1", expect.objectContaining({
        amountCents: 4180,
        fromAccountId: "acc1",
      }));
    });

    it("calls payStatement when paying partial", async () => {
      const paySpy = vi.fn();
      vi.spyOn(appStateModule, "useAppState").mockReturnValue(
        mockState({ payStatement: paySpy, cardStatements: [{ id: "stmt-1", accountId: "acc4", cycleYearMonth: "2026-06", closingDate: "2026-06-15", dueDate: "2026-06-25", totalCents: 4180, paidCents: 0, status: "open" }] }),
      );
      const user = userEvent.setup();
      render(<CardsPage />);
      await user.click(screen.getByText("Nubank Crédito"));
      await user.click(screen.getByText(/pagar fatura/i));
      // Switch to Partial
      await user.click(screen.getByText("Parcial"));
      // Fill partial amount
      const partialInput = screen.getAllByPlaceholderText("0,00")[0];
      await user.type(partialInput, "2000");
      // Select account
      const nubankBtns = screen.getAllByText("Nubank");
      await user.click(nubankBtns[nubankBtns.length - 1]);
      await user.click(screen.getByRole("button", { name: /Pagar valor parcial/i }));
      expect(paySpy).toHaveBeenCalledWith("stmt-1", expect.objectContaining({
        amountCents: 2000,
      }));
    });
  });

  // ── Editing a card ──
  describe("editing a card", () => {
    it("opens edit sheet and calls updateCard", async () => {
      const updateSpy = vi.fn();
      vi.spyOn(appStateModule, "useAppState").mockReturnValue(mockState({ updateCard: updateSpy }));
      const user = userEvent.setup();
      render(<CardsPage />);
      await user.click(screen.getByText("Nubank Crédito"));
      await user.click(screen.getByText("Editar"));
      await user.click(screen.getByRole("button", { name: "Salvar edição do cartão" }));
      expect(updateSpy).toHaveBeenCalledWith("acc4", expect.objectContaining({
        name: "Nubank Crédito",
      }));
    });
  });

  // ── Loading/Error ──
  describe("loading", () => {
    it("shows loading indicator", () => { vi.spyOn(appStateModule, "useAppState").mockReturnValue(mockState({ loading: true })); render(<CardsPage />); expect(screen.getByText(/carregando/i)).toBeInTheDocument(); expect(screen.queryByText("Nubank Crédito")).not.toBeInTheDocument(); });
  });

  describe("error", () => {
    it("shows error banner alongside data", () => { vi.spyOn(appStateModule, "useAppState").mockReturnValue(mockState({ error: "Erro" })); render(<CardsPage />); expect(screen.getByText(/Erro/i)).toBeInTheDocument(); expect(screen.getByText("Nubank Crédito")).toBeInTheDocument(); });
  });

  describe("statement data in card list", () => {
    it("shows statement totalCents instead of transaction-based spentCents", () => {
      vi.spyOn(appStateModule, "useAppState").mockReturnValue(
        mockState({
          cardStatements: [
            {
              id: "stmt-acc4",
              accountId: "acc4",
              cycleYearMonth: "2026-06",
              closingDate: "2026-06-15",
              dueDate: "2026-06-25",
              totalCents: 77740,
              paidCents: 0,
              status: "open",
            },
          ],
        }),
      );
      render(<CardsPage />);
      // Statement total (R$ 777,40) overrides transaction-based total (R$ 41,80)
      expect(screen.getByText(/777,40/)).toBeInTheDocument();
      // The old transaction-based number should NOT be the primary total
      // (may appear elsewhere as subtotal but not as the fatura total)
    });
  });

  describe("statement detail purchases", () => {
    it("loads statement detail and shows purchases when card is opened", async () => {
      const user = userEvent.setup();
      vi.spyOn(endpoints, "fetchStatementDetail").mockResolvedValue({
        id: "stmt-acc4",
        accountId: "acc4",
        cycleYearMonth: "2026-06",
        closingDate: "2026-06-15",
        dueDate: "2026-06-25",
        totalCents: 77740,
        paidCents: 0,
        status: "open",
        purchases: [
          {
            id: "detail-p1",
            description: "Compra do statement",
            amountCents: 5000,
            date: "2026-06-10",
            categoryName: "Alimentação",
          },
        ],
      });
      vi.spyOn(appStateModule, "useAppState").mockReturnValue(
        mockState({
          cardStatements: [
            {
              id: "stmt-acc4",
              accountId: "acc4",
              cycleYearMonth: "2026-06",
              closingDate: "2026-06-15",
              dueDate: "2026-06-25",
              totalCents: 77740,
              paidCents: 0,
              status: "open",
            },
          ],
        }),
      );
      render(<CardsPage />);
      await user.click(screen.getByText("Nubank Crédito"));
      // Wait for the statement detail purchases to render
      await waitFor(() =>
        expect(screen.getByText("Compra do statement")).toBeInTheDocument(),
      );
    });

    it("falls back to transaction-based purchases when no statement detail", async () => {
      const user = userEvent.setup();
      render(<CardsPage />);
      await user.click(screen.getByText("Nubank Crédito"));
      // Existing transaction-based purchases still appear (fallback)
      expect(screen.getByText("App Store")).toBeInTheDocument();
    });
  });

  describe("paying selected (not always latest) statement", () => {
    it("pays the historical statement when it is selected in the history", async () => {
      const paySpy = vi.fn();
      vi.spyOn(endpoints, "fetchStatementDetail").mockImplementation(async (id: string) => {
        if (id === "stmt-may") {
          return { id: "stmt-may", accountId: "acc4", cycleYearMonth: "2026-05", closingDate: "2026-05-15", dueDate: "2026-05-25", totalCents: 50000, paidCents: 0, status: "open", purchases: [{ id: "p-may", description: "Compra maio", amountCents: 50000, date: "2026-05-10", categoryName: "Mercado" }] } as any;
        }
        return { id: "stmt-jun", accountId: "acc4", cycleYearMonth: "2026-06", closingDate: "2026-06-15", dueDate: "2026-06-25", totalCents: 77740, paidCents: 0, status: "open", purchases: [{ id: "p-jun", description: "Compra junho", amountCents: 77740, date: "2026-06-10", categoryName: "Mercado" }] } as any;
      });
      vi.spyOn(appStateModule, "useAppState").mockReturnValue(
        mockState({
          payStatement: paySpy,
          cardStatements: [
            { id: "stmt-jun", accountId: "acc4", cycleYearMonth: "2026-06", closingDate: "2026-06-15", dueDate: "2026-06-25", totalCents: 77740, paidCents: 0, status: "open" },
            { id: "stmt-may", accountId: "acc4", cycleYearMonth: "2026-05", closingDate: "2026-05-15", dueDate: "2026-05-25", totalCents: 50000, paidCents: 0, status: "open" },
          ],
        }),
      );
      const user = userEvent.setup();
      render(<CardsPage />);
      await user.click(screen.getByText("Nubank Crédito"));
      // Select the May (historical) statement
      await user.click(screen.getByRole("button", { name: /maio de 2026/i }));
      await waitFor(() => expect(screen.getByText("Compra maio")).toBeInTheDocument());
      // Click Pagar fatura
      await user.click(screen.getByText(/pagar fatura/i));
      // Select account
      const nubankBtns = screen.getAllByText("Nubank");
      await user.click(nubankBtns[nubankBtns.length - 1]);
      await user.click(screen.getByRole("button", { name: /Pagar fatura total/i }));
      // Must pay stmt-may (the selected historical one), NOT stmt-jun (the latest)
      expect(paySpy).toHaveBeenCalledWith("stmt-may", expect.objectContaining({
        amountCents: 50000,
      }));
    });
  });

  describe("pay button respects statement status", () => {
    it("disables Pagar fatura when a paid statement is selected", async () => {
      const user = userEvent.setup();
      vi.spyOn(endpoints, "fetchStatementDetail").mockResolvedValue({
        id: "stmt-may", accountId: "acc4", cycleYearMonth: "2026-05", closingDate: "2026-05-15", dueDate: "2026-05-25", totalCents: 50000, paidCents: 50000, status: "paid", purchases: [],
      } as any);
      vi.spyOn(appStateModule, "useAppState").mockReturnValue(
        mockState({
          cardStatements: [
            { id: "stmt-jun", accountId: "acc4", cycleYearMonth: "2026-06", closingDate: "2026-06-15", dueDate: "2026-06-25", totalCents: 77740, paidCents: 0, status: "open" },
            { id: "stmt-may", accountId: "acc4", cycleYearMonth: "2026-05", closingDate: "2026-05-15", dueDate: "2026-05-25", totalCents: 50000, paidCents: 50000, status: "paid" },
          ],
        }),
      );
      render(<CardsPage />);
      await user.click(screen.getByText("Nubank Crédito"));
      // Initially open statement is selected — button should be active
      expect(screen.getByRole("button", { name: /pagar fatura/i })).not.toBeDisabled();
      // Click the paid May statement
      await user.click(screen.getByRole("button", { name: /maio de 2026.*Paga/i }));
      // Now the pay button should be disabled
      await waitFor(() => expect(screen.getByRole("button", { name: /pagar fatura/i })).toBeDisabled());
    });

    it("keeps Pagar fatura active when an open statement is selected", async () => {
      const user = userEvent.setup();
      vi.spyOn(endpoints, "fetchStatementDetail").mockResolvedValue({
        id: "stmt-may", accountId: "acc4", cycleYearMonth: "2026-05", closingDate: "2026-05-15", dueDate: "2026-05-25", totalCents: 50000, paidCents: 50000, status: "paid", purchases: [],
      } as any);
      vi.spyOn(appStateModule, "useAppState").mockReturnValue(
        mockState({
          cardStatements: [
            { id: "stmt-jun", accountId: "acc4", cycleYearMonth: "2026-06", closingDate: "2026-06-15", dueDate: "2026-06-25", totalCents: 77740, paidCents: 0, status: "open" },
            { id: "stmt-may", accountId: "acc4", cycleYearMonth: "2026-05", closingDate: "2026-05-15", dueDate: "2026-05-25", totalCents: 50000, paidCents: 50000, status: "paid" },
          ],
        }),
      );
      render(<CardsPage />);
      await user.click(screen.getByText("Nubank Crédito"));
      // Click paid → verify disabled
      await user.click(screen.getByRole("button", { name: /maio de 2026.*Paga/i }));
      await waitFor(() => expect(screen.getByRole("button", { name: /pagar fatura/i })).toBeDisabled());
      // Click back to open June statement → verify active again
      await user.click(screen.getByRole("button", { name: /junho de 2026.*Aberta/i }));
      await waitFor(() => expect(screen.getByRole("button", { name: /pagar fatura/i })).not.toBeDisabled());
    });
  });

  describe("statement history", () => {
    it("shows an honest empty state instead of synthetic months when no statements", async () => {
      const user = userEvent.setup();
      render(<CardsPage />);
      await user.click(screen.getByText("Nubank Crédito"));
      expect(
        screen.getByText(/Nenhuma fatura anterior registrada/i),
      ).toBeInTheDocument();
    });

    it("switches to the clicked historical statement and loads its purchases", async () => {
      const user = userEvent.setup();
      vi.spyOn(endpoints, "fetchStatementDetail").mockImplementation(async (id: string) => {
        if (id === "stmt-jun") {
          return {
            id,
            accountId: "acc4",
            cycleYearMonth: "2026-06",
            closingDate: "2026-06-15",
            dueDate: "2026-06-25",
            totalCents: 162730,
            paidCents: 0,
            status: "open",
            purchases: [
              {
                id: "jun-p1",
                description: "Compra de junho",
                amountCents: 162730,
                date: "2026-06-10",
                categoryName: "Mercado",
              },
            ],
          };
        }

        return {
          id,
          accountId: "acc4",
          cycleYearMonth: "2026-07",
          closingDate: "2026-07-05",
          dueDate: "2026-07-13",
          totalCents: 77740,
          paidCents: 0,
          status: "open",
          purchases: [
            {
              id: "jul-p1",
              description: "Compra de julho",
              amountCents: 77740,
              date: "2026-07-02",
              categoryName: "Mercado",
            },
          ],
        };
      });
      vi.spyOn(appStateModule, "useAppState").mockReturnValue(
        mockState({
          cardStatements: [
            {
              id: "stmt-jul",
              accountId: "acc4",
              cycleYearMonth: "2026-07",
              closingDate: "2026-07-05",
              dueDate: "2026-07-13",
              totalCents: 77740,
              paidCents: 0,
              status: "open",
            },
            {
              id: "stmt-jun",
              accountId: "acc4",
              cycleYearMonth: "2026-06",
              closingDate: "2026-06-15",
              dueDate: "2026-06-25",
              totalCents: 162730,
              paidCents: 0,
              status: "open",
            },
          ],
        }),
      );

      render(<CardsPage />);
      await user.click(screen.getByText("Nubank Crédito"));

      await waitFor(() => expect(screen.getByText("Compra de julho")).toBeInTheDocument());
      await user.click(screen.getByRole("button", { name: /junho de 2026/i }));

      await waitFor(() => expect(screen.getByText("Compra de junho")).toBeInTheDocument());
      expect(screen.getAllByText(/1\.627,30/).length).toBeGreaterThan(0);
      expect(endpoints.fetchStatementDetail).toHaveBeenCalledWith("stmt-jun");
    });
  });

  describe("deep-link from Home (Slice A: ?cardId=)", () => {
    /**
     * Home now routes to /cartoes?cardId=<id> when the user taps a card row.
     * CardsPage must already render that card in detail view, without the
     * user having to tap the card tile first.
     */
    function setUrlSearch(search: string) {
      Object.defineProperty(window, "location", {
        value: { ...window.location, search },
        writable: true,
        configurable: true,
      });
    }

    it("opens the matching card detail when ?cardId=<id> is in the URL", () => {
      setUrlSearch("?cardId=acc4");
      vi.spyOn(endpoints, "fetchStatementDetail").mockResolvedValue({
        id: "stmt",
        accountId: "acc4",
        cycleYearMonth: "2026-07",
        closingDate: "2026-07-05",
        dueDate: "2026-07-13",
        totalCents: 0,
        paidCents: 0,
        status: "open",
        purchases: [],
      });
      render(<CardsPage />);
      // The detail view shows the back button "Cartões" and the hero name.
      expect(screen.getByText("Nubank Crédito")).toBeInTheDocument();
      // The "Pagar fatura" CTA is only present in detail mode.
      expect(screen.getByRole("button", { name: /pagar fatura/i })).toBeInTheDocument();
      // Back-button label is the routing breadcrumb.
      expect(screen.getByRole("button", { name: /^Cartões$/i })).toBeInTheDocument();
    });

    it("stays on the card overview when ?cardId is missing", () => {
      setUrlSearch("");
      render(<CardsPage />);
      // In overview mode, the "Pagar fatura" CTA is NOT rendered (only when
      // a card is selected).
      expect(screen.queryByRole("button", { name: /pagar fatura/i })).not.toBeInTheDocument();
      // Card tiles are present.
      expect(screen.getByText("Nubank Crédito")).toBeInTheDocument();
    });

    it("ignores ?cardId that does not match any card (renders overview)", () => {
      setUrlSearch("?cardId=acc-missing");
      render(<CardsPage />);
      // No detail view opened; "Pagar fatura" CTA is absent.
      expect(screen.queryByRole("button", { name: /pagar fatura/i })).not.toBeInTheDocument();
    });
  });
});
