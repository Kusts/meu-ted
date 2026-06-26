import { render, screen } from "@/lib/test-utils";
import userEvent from "@testing-library/user-event";
import AppShell from "../AppShell";
import * as appStateModule from "@/lib/state/app-state-context";
import { mockAccounts, mockCategories, ALL_MOCK_TRANSACTIONS, mockPayables, mockBudgets, mockGoals } from "@/lib/state/mock-data";
import type { AppState } from "@/lib/state/app-state-context";

let mockPath = "/";
vi.mock("next/navigation", () => ({
  usePathname: () => mockPath,
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

function navButton(label: string): HTMLButtonElement {
  const button = screen.getByText(label).closest("button");
  if (!button) throw new Error(`Button for ${label} not found`);
  return button as HTMLButtonElement;
}

function expectActive(label: string) {
  expect(navButton(label)).toHaveStyle({ color: "var(--color-primary)" });
}

function expectInactive(label: string) {
  expect(navButton(label)).toHaveStyle({ color: "var(--color-text-muted)" });
}

describe("AppShell", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockPath = "/";
  });

  describe("rendering", () => {
    it("renders children", () => {
      render(<AppShell><div data-testid="content">Hello</div></AppShell>);
      expect(screen.getByTestId("content")).toBeInTheDocument();
    });

    it("renders bottom navigation", () => {
      render(<AppShell><div>Content</div></AppShell>);
      expect(screen.getByText("Resumo")).toBeInTheDocument();
      const buttons = screen.getAllByRole("button");
      expect(buttons.length).toBeGreaterThanOrEqual(4);
    });
  });

  describe("active nav state", () => {
    it("highlights Resumo for /", () => {
      mockPath = "/";
      render(<AppShell><div>Content</div></AppShell>);
      expectActive("Resumo");
      expectInactive("Mais");
    });

    it("highlights Registros for /registros", () => {
      mockPath = "/registros";
      render(<AppShell><div>Content</div></AppShell>);
      expectActive("Registros");
      expectInactive("Resumo");
    });

    it("highlights A pagar for /a-pagar", () => {
      mockPath = "/a-pagar";
      render(<AppShell><div>Content</div></AppShell>);
      expectActive("A pagar");
      expectInactive("Resumo");
    });

    it.each(["/cartoes", "/contas", "/metas", "/perfil", "/assinaturas", "/orcamentos", "/categorias", "/relatorios", "/patrimonio"])(
      "highlights Mais for secondary route %s",
      (route) => {
        mockPath = route;
        render(<AppShell><div>{route}</div></AppShell>);
        expectActive("Mais");
        expectInactive("Resumo");
      },
    );
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

      await user.click(screen.getByLabelText("Nova transação"));
      const amountInput = screen.getByPlaceholderText("0,00");
      await user.type(amountInput, "5000");
      const descInput = screen.getByPlaceholderText(/Aluguel, mercado/);
      await user.type(descInput, "Mercado semanal");
      await user.click(screen.getByText("Alimentação"));
      await user.click(screen.getByText("Nubank"));
      await user.click(screen.getByText("Salvar"));

      expect(addSpy).toHaveBeenCalledTimes(1);
      const callArg = addSpy.mock.calls[0][0];
      expect(callArg.kind).toBe("expense");
      expect(callArg.amountCents).toBe(5000);
      expect(callArg.description).toBe("Mercado semanal");
    });

    it("uses createTransfer for transfers", async () => {
      const transferSpy = vi.fn().mockResolvedValue(undefined);
      const state = { ...defaultState(), createTransfer: transferSpy };
      vi.spyOn(appStateModule, "useAppState").mockReturnValue(state);

      const user = userEvent.setup();
      render(<AppShell><div>Content</div></AppShell>);

      await user.click(screen.getByLabelText("Nova transação"));
      await user.click(screen.getByText("Transferência"));
      const amountInput = screen.getByPlaceholderText("0,00");
      await user.type(amountInput, "10000");
      const descInput = screen.getByPlaceholderText(/Aluguel, mercado/);
      await user.type(descInput, "PIX para poupança");
      const nubankButtons = screen.getAllByText("Nubank");
      await user.click(nubankButtons[0]);
      const interButtons = screen.getAllByText("Inter");
      await user.click(interButtons[0]);
      await user.click(screen.getByText("Transferir"));

      expect(transferSpy).toHaveBeenCalledTimes(1);
      expect(transferSpy).toHaveBeenCalledWith(
        expect.objectContaining({ description: "PIX para poupança", amountCents: 10000 }),
      );
    });

    it("calls createInstallments when installments are active", async () => {
      const installmentsSpy = vi.fn().mockResolvedValue(undefined);
      const state = { ...defaultState(), createInstallments: installmentsSpy };
      vi.spyOn(appStateModule, "useAppState").mockReturnValue(state);

      const user = userEvent.setup();
      render(<AppShell><div>Content</div></AppShell>);

      await user.click(screen.getByLabelText("Nova transação"));
      const valorInput = screen.getByPlaceholderText(/0,00/);
      await user.type(valorInput, "600000");
      const descInput = screen.getByPlaceholderText(/Aluguel, mercado/);
      await user.type(descInput, "Notebook");
      await user.click(screen.getByLabelText("Alternar parcelamento"));
      await user.click(screen.getByText("12x"));
      await user.click(screen.getByText("Nubank Crédito"));
      await user.click(screen.getByText("Salvar em 12x"));

      expect(installmentsSpy).toHaveBeenCalledTimes(1);
      expect(installmentsSpy).toHaveBeenCalledWith(
        expect.objectContaining({ totalAmountCents: 600000, installmentsTotal: 12, description: "Notebook" }),
      );
    });
  });
});
