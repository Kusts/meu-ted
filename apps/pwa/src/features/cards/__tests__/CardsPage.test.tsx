import { render, screen } from "@/lib/test-utils";
import userEvent from "@testing-library/user-event";
import CardsPage from "../CardsPage";
import * as appStateModule from "@/lib/state/app-state-context";
import { mockAccounts, mockCategories, ALL_MOCK_TRANSACTIONS, mockPayables, mockBudgets, mockGoals } from "@/lib/state/mock-data";
import type { AppState } from "@/lib/state/app-state-context";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

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

  describe("statement history", () => {
    it("shows an honest empty state instead of synthetic months when no statements", async () => {
      const user = userEvent.setup();
      render(<CardsPage />);
      await user.click(screen.getByText("Nubank Crédito"));
      expect(
        screen.getByText(/Nenhuma fatura anterior registrada/i),
      ).toBeInTheDocument();
    });
  });
});
