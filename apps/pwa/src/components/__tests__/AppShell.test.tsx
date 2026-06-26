import { render, screen } from "@/lib/test-utils";
import userEvent from "@testing-library/user-event";
import AppShell from "../AppShell";
import * as appStateModule from "@/lib/state/app-state-context";
import { mockAccounts, mockCategories, ALL_MOCK_TRANSACTIONS, mockPayables, mockBudgets, mockGoals } from "@/lib/state/mock-data";
import type { AppState } from "@/lib/state/app-state-context";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn() }),
}));

function defaultState(): AppState {
  return {
    accounts: [...mockAccounts], categories: [...mockCategories],
    transactions: [...ALL_MOCK_TRANSACTIONS], payables: [...mockPayables],
    budgets: [...mockBudgets], goals: [...mockGoals],
    debts: [], subscriptions: [], loading: false, error: null,
    addTransaction: vi.fn(), deleteTransaction: vi.fn(), markPayablePaid: vi.fn(),
    cardStatements: [], writeError: null, clearWriteError: vi.fn(),
    addAccount: vi.fn(), addCategory: vi.fn(), addCard: vi.fn(), updateCard: vi.fn(),
    addSubscription: vi.fn(), cancelSubscription: vi.fn(),
    createTransfer: vi.fn(), payStatement: vi.fn(), createInstallments: vi.fn(),
  };
}

describe("AppShell", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("rendering", () => {
    it("renders children", () => {
      render(<AppShell><div data-testid="content">Hello</div></AppShell>);
      expect(screen.getByTestId("content")).toBeInTheDocument();
    });

    it("renders bottom navigation", () => {
      render(<AppShell><div>Content</div></AppShell>);
      expect(screen.getByText("Resumo")).toBeInTheDocument();
      // Bottom nav has 4 items + FAB = 5 buttons
      const buttons = screen.getAllByRole("button");
      expect(buttons.length).toBeGreaterThanOrEqual(4);
    });
  });

  describe("sheet navigation", () => {
    it("opens new transaction sheet when FAB is clicked", async () => {
      const user = userEvent.setup();
      render(<AppShell><div>Content</div></AppShell>);
      await user.click(screen.getByLabelText("Nova transação"));
      expect(screen.getByText("Novo lançamento")).toBeInTheDocument();
      expect(screen.getByText("Despesa")).toBeInTheDocument();
    });

    it("opens Mais grid when Mais is clicked", async () => {
      const user = userEvent.setup();
      render(<AppShell><div>Content</div></AppShell>);
      const buttons = screen.getAllByRole("button");
      await user.click(buttons[4]);
      expect(screen.getByText("Cartões")).toBeInTheDocument();
      expect(screen.getByText("Contas")).toBeInTheDocument();
    });
  });

  describe("add transaction flow", () => {
    it("adds an expense and calls addTransaction", async () => {
      const addSpy = vi.fn().mockResolvedValue(undefined);
      const state = { ...defaultState(), addTransaction: addSpy };
      vi.spyOn(appStateModule, "useAppState").mockReturnValue(state);

      const user = userEvent.setup();
      render(<AppShell><div>Content</div></AppShell>);

      // Open sheet
      await user.click(screen.getByLabelText("Nova transação"));

      // Fill amount: type "5000" → displays "50,00" → 5000 cents
      const amountInput = screen.getByPlaceholderText("0,00");
      await user.type(amountInput, "5000");

      // Fill description
      const descInput = screen.getByPlaceholderText(/Aluguel, mercado/);
      await user.type(descInput, "Mercado semanal");

      // Select category "Alimentação"
      await user.click(screen.getByText("Alimentação"));

      // Select account "Nubank"
      await user.click(screen.getByText("Nubank"));

      // Save
      await user.click(screen.getByText("Salvar"));

      // Assert addTransaction was called with expense data
      expect(addSpy).toHaveBeenCalledTimes(1);
      const callArg = addSpy.mock.calls[0][0];
      expect(callArg.kind).toBe("expense");
      expect(callArg.amountCents).toBe(5000);
      expect(callArg.description).toBe("Mercado semanal");
      expect(callArg.categoryId).toBe("cat1");
      expect(callArg.accountId).toBe("acc1");
    });

    it("uses createTransfer for transfers", async () => {
      const transferSpy = vi.fn().mockResolvedValue(undefined);
      const state = { ...defaultState(), createTransfer: transferSpy };
      vi.spyOn(appStateModule, "useAppState").mockReturnValue(state);

      const user = userEvent.setup();
      render(<AppShell><div>Content</div></AppShell>);

      await user.click(screen.getByLabelText("Nova transação"));

      // Switch to transfer tab
      await user.click(screen.getByText("Transferência"));

      // Fill amount
      const amountInput = screen.getByPlaceholderText("0,00");
      await user.type(amountInput, "10000");

      // Fill description
      const descInput = screen.getByPlaceholderText(/Aluguel, mercado/);
      await user.type(descInput, "PIX para poupança");

      // Select from account
      const nubankButtons = screen.getAllByText("Nubank");
      await user.click(nubankButtons[0]);

      // Select to account
      const interButtons = screen.getAllByText("Inter");
      await user.click(interButtons[0]);

      // Save
      await user.click(screen.getByText("Transferir"));

      // Transfer calls createTransfer once (not addTransaction)
      expect(transferSpy).toHaveBeenCalledTimes(1);
      expect(transferSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          description: "PIX para poupança",
          amountCents: 10000,
        }),
      );
    });

    it("calls createInstallments when installments are active", async () => {
      const installmentsSpy = vi.fn().mockResolvedValue(undefined);
      const state = { ...defaultState(), createInstallments: installmentsSpy };
      vi.spyOn(appStateModule, "useAppState").mockReturnValue(state);

      const user = userEvent.setup();
      render(<AppShell><div>Content</div></AppShell>);

      await user.click(screen.getByLabelText("Nova transação"));

      // Fill amount
      const valorInput = screen.getByPlaceholderText(/0,00/);
      await user.type(valorInput, "600000");

      // Fill description
      const descInput = screen.getByPlaceholderText(/Aluguel, mercado/);
      await user.type(descInput, "Notebook");

      // Enable installments
      await user.click(screen.getByLabelText("Alternar parcelamento"));

      // Select 12x
      await user.click(screen.getByText("12x"));

      // Select a credit card
      await user.click(screen.getByText("Nubank Crédito"));

      // Save
      await user.click(screen.getByText("Salvar em 12x"));

      expect(installmentsSpy).toHaveBeenCalledTimes(1);
      expect(installmentsSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          totalAmountCents: 600000,
          installmentsTotal: 12,
          description: "Notebook",
        }),
      );
    });
  });
});
