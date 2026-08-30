import { render, screen } from "@/lib/test-utils";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
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
  const bottomNav = document.querySelector('[data-nav="bottom"]');
  const elements = screen.getAllByText(label);
  const button = elements
    .map((el) => el.closest("button"))
    .find((b) => b && (!bottomNav || bottomNav.contains(b)));
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
      expect(screen.getAllByText("Resumo").length).toBeGreaterThanOrEqual(1);
      const bottomNav = document.querySelector('[data-nav="bottom"]');
      expect(bottomNav).toBeInTheDocument();
    });
  });

  describe("responsive shell", () => {
    it("wraps content in a responsive container with --shell-max-w variable", () => {
      const { container } = render(
        <AppShell><div data-testid="content">Hello</div></AppShell>,
      );
      const shell = container.querySelector('[data-shell="root"]') as HTMLElement;
      expect(shell).toBeInTheDocument();
      expect(shell.className).toMatch(/max-w-\[var\(--shell-max-w\)\]/);
    });

    it("uses mx-auto to center the shell on wide viewports", () => {
      const { container } = render(
        <AppShell><div>Content</div></AppShell>,
      );
      const shell = container.querySelector('[data-shell="root"]') as HTMLElement;
      expect(shell.className).toMatch(/mx-auto/);
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

    it.each(["/cartoes", "/contas", "/metas", "/perfil", "/assinaturas", "/orcamentos", "/categorias", "/relatorios", "/patrimonio", "/workspaces"])(
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
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(screen.getByText("Despesa")).toBeInTheDocument();
    });

    it("opens Mais grid when Mais is clicked", async () => {
      const user = userEvent.setup();
      render(<AppShell><div>Content</div></AppShell>);
      await user.click(navButton("Mais"));
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(screen.getAllByText("Cartões").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("Contas").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("Workspaces").length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("sheet close behaviors", () => {
    it("closes sheet when navigating between tabs", async () => {
      const user = userEvent.setup();
      render(<AppShell><div>Content</div></AppShell>);

      // Open sheet via FAB
      await user.click(screen.getByLabelText("Nova transação"));
      expect(screen.getByRole("dialog")).toBeInTheDocument();

      // Click bottom nav "Registros"
      await user.click(navButton("Registros"));

      // Sheet should close (no dialog present)
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("closes sheet via Escape key", async () => {
      const user = userEvent.setup();
      render(<AppShell><div>Content</div></AppShell>);

      // Open sheet via FAB
      await user.click(screen.getByLabelText("Nova transação"));
      expect(screen.getByRole("dialog")).toBeInTheDocument();

      // Press Escape
      await user.keyboard("{Escape}");

      // Sheet should close
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("closes sheet and leaves no residual overlay", async () => {
      const user = userEvent.setup();
      render(<AppShell><div>Content</div></AppShell>);

      // Open sheet
      await user.click(screen.getByLabelText("Nova transação"));
      expect(screen.getByRole("dialog")).toBeInTheDocument();

      // Close via backdrop
      const dialog = screen.getByRole("dialog");
      const overlay = dialog.firstElementChild;
      await user.click(overlay!);

      // After close, no dialog should remain
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
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
      await user.click(screen.getAllByText("Nubank")[0]);
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
      await user.click(nubankButtons[0]); // origin
      const interButtons = screen.getAllByText("Inter");
      // last Inter chip is under Destino (entrada)
      await user.click(interButtons[interButtons.length - 1]);
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
