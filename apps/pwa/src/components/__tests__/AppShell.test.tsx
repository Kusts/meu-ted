import { render, screen } from "@/lib/test-utils";
import userEvent from "@testing-library/user-event";
import AppShell from "../AppShell";
import * as appStateModule from "@/lib/state/app-state-context";
import * as unsavedModule from "@/lib/unsaved-changes";
import { mockAccounts, mockCategories, ALL_MOCK_TRANSACTIONS, mockPayables, mockBudgets, mockGoals } from "@/lib/state/mock-data";
import type { AppState } from "@/lib/state/app-state-context";

let mockPath = "/";
let mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => mockPath,
  useRouter: () => ({ push: mockPush }),
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
    mockPush = vi.fn();
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

    it("navigates when clicking a Mais grid item", async () => {
      const user = userEvent.setup();
      const pushSpy = vi.fn();
      mockPush = pushSpy;
      render(<AppShell><div>Content</div></AppShell>);

      // Open Mais grid
      const buttons = screen.getAllByRole("button");
      await user.click(buttons[4]);
      expect(screen.getByText("Cartões")).toBeInTheDocument();

      // Click Cartões grid item — should navigate
      await user.click(screen.getByText("Cartões"));
      expect(pushSpy).toHaveBeenCalledWith("/cartoes");
    });

    it("closes Mais grid then navigates to secondary route on item click", async () => {
      const user = userEvent.setup();
      const pushSpy = vi.fn();
      mockPush = pushSpy;
      render(<AppShell><div>Content</div></AppShell>);

      // Open Mais grid
      const buttons = screen.getAllByRole("button");
      await user.click(buttons[4]);
      expect(screen.getByText("Cartões")).toBeInTheDocument();

      // Click Orçamentos to navigate
      await user.click(screen.getByText("Orçamentos"));
      expect(pushSpy).toHaveBeenCalledWith("/orcamentos");

      // Sheet should close and Mais grid gone
      expect(screen.queryByText("Cartões")).not.toBeInTheDocument();
    });
  });

  describe("sheet close behaviors", () => {
    it("closes sheet when navigating between tabs", async () => {
      const user = userEvent.setup();
      render(<AppShell><div>Content</div></AppShell>);

      // Open sheet via FAB
      await user.click(screen.getByLabelText("Nova transação"));
      expect(screen.getByText("Novo lançamento")).toBeInTheDocument();

      // Click bottom nav "Registros"
      await user.click(screen.getByText("Registros"));

      // Sheet should close (no dialog present)
      expect(screen.queryByText("Novo lançamento")).not.toBeInTheDocument();
    });

    it("closes sheet via Escape key", async () => {
      const user = userEvent.setup();
      render(<AppShell><div>Content</div></AppShell>);

      // Open sheet via FAB
      await user.click(screen.getByLabelText("Nova transação"));
      expect(screen.getByText("Novo lançamento")).toBeInTheDocument();

      // Press Escape
      await user.keyboard("{Escape}");

      // Sheet should close
      expect(screen.queryByText("Novo lançamento")).not.toBeInTheDocument();
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

  describe("dirty form confirmation (useUnsavedChangesSafe)", () => {
    function renderWithDirtyForm(dirty: boolean) {
      vi.spyOn(unsavedModule, "useUnsavedChangesSafe").mockReturnValue({
        isDirty: dirty,
        trackWrite: () => () => {},
        markDirty: () => {},
        markClean: () => {},
        isFormDirty: () => dirty,
      });
    }

    it("closes sheet normally when form is clean", async () => {
      renderWithDirtyForm(false);
      const user = userEvent.setup();
      render(<AppShell><div>Content</div></AppShell>);

      // Open sheet
      await user.click(screen.getByLabelText("Nova transação"));
      expect(screen.getByText("Novo lançamento")).toBeInTheDocument();

      // Close via backdrop
      const dialog = screen.getByRole("dialog");
      const overlay = dialog.firstElementChild;
      await user.click(overlay!);

      // Sheet should close without confirm dialog
      expect(screen.queryByText("Descartar alterações?")).not.toBeInTheDocument();
      expect(screen.queryByText("Novo lançamento")).not.toBeInTheDocument();
    });

    it("shows confirm dialog when closing sheet with dirty form", async () => {
      renderWithDirtyForm(true);
      const user = userEvent.setup();
      render(<AppShell><div>Content</div></AppShell>);

      // Open sheet
      await user.click(screen.getByLabelText("Nova transação"));
      expect(screen.getByText("Novo lançamento")).toBeInTheDocument();

      // Click the sheet close button to trigger requestCloseSheet
      const closeButtons = screen.getAllByRole("button").filter(b => b.getAttribute("aria-label") === "Fechar");
      if (closeButtons.length > 0) {
        await user.click(closeButtons[0]);
      } else {
        // Fallback: press Escape
        await user.keyboard("{Escape}");
      }

      // Confirm dialog visible
      expect(screen.getByText("Descartar alterações?")).toBeInTheDocument();

      // Sheet still open underneath
      expect(screen.getByText("Novo lançamento")).toBeInTheDocument();
    });

    it("keeps sheet open when user cancels discard", async () => {
      renderWithDirtyForm(true);
      const user = userEvent.setup();
      render(<AppShell><div>Content</div></AppShell>);

      // Open sheet
      await user.click(screen.getByLabelText("Nova transação"));
      expect(screen.getByText("Novo lançamento")).toBeInTheDocument();

      // Press Escape to trigger requestCloseSheet
      await user.keyboard("{Escape}");

      // Cancel
      await user.click(screen.getByText("Continuar editando"));

      // Sheet stays open, confirm gone
      expect(screen.queryByText("Descartar alterações?")).not.toBeInTheDocument();
      expect(screen.getByText("Novo lançamento")).toBeInTheDocument();
    });

    it("discards and closes sheet when user confirms", async () => {
      renderWithDirtyForm(true);
      const user = userEvent.setup();
      render(<AppShell><div>Content</div></AppShell>);

      // Open sheet
      await user.click(screen.getByLabelText("Nova transação"));

      // Press Escape to trigger requestCloseSheet (shows confirm dialog)
      await user.keyboard("{Escape}");

      // Confirm discard
      await user.click(screen.getByText("Descartar"));

      // Sheet closes, no navigation (no pendingNav)
      expect(screen.queryByText("Novo lançamento")).not.toBeInTheDocument();
      expect(mockPush).not.toHaveBeenCalled();
    });

    it("shows confirm on dirty + nav click, then navigates on confirm", async () => {
      renderWithDirtyForm(true);
      const user = userEvent.setup();
      render(<AppShell><div>Content</div></AppShell>);

      // Open sheet
      await user.click(screen.getByLabelText("Nova transação"));
      expect(screen.getByText("Novo lançamento")).toBeInTheDocument();

      // Click nav to /registros while dirty
      await user.click(screen.getByText("Registros"));

      // Confirm dialog shown
      expect(screen.getByText("Descartar alterações?")).toBeInTheDocument();

      // Confirm
      await user.click(screen.getByText("Descartar"));

      // Sheet closes AND navigates
      expect(screen.queryByText("Novo lançamento")).not.toBeInTheDocument();
      expect(mockPush).toHaveBeenCalledWith("/registros");
    });

    it("closes sheet on nav click when clean (no confirm)", async () => {
      renderWithDirtyForm(false);
      const user = userEvent.setup();
      render(<AppShell><div>Content</div></AppShell>);

      // Open sheet
      await user.click(screen.getByLabelText("Nova transação"));
      expect(screen.getByText("Novo lançamento")).toBeInTheDocument();

      // Navigate while clean
      await user.click(screen.getByText("Registros"));

      // No confirm, sheet closed, navigated
      expect(screen.queryByText("Descartar alterações?")).not.toBeInTheDocument();
      expect(screen.queryByText("Novo lançamento")).not.toBeInTheDocument();
      expect(mockPush).toHaveBeenCalledWith("/registros");
    });

    it("does not show confirm for clean nav click even with sheet open", async () => {
      renderWithDirtyForm(false);
      const user = userEvent.setup();
      render(<AppShell><div>Content</div></AppShell>);

      // Open Mais sheet ("more" mode — no form)
      const buttons = screen.getAllByRole("button");
      await user.click(buttons[4]);
      expect(screen.getByText("Cartões")).toBeInTheDocument();

      // Navigate — clean, no confirm
      await user.click(screen.getByText("Registros"));
      expect(screen.queryByText("Descartar alterações?")).not.toBeInTheDocument();
    });
  });

  describe("save error handling", () => {
    it("keeps sheet open when addTransaction rejects", async () => {
      const error = new Error("API validation error");
      vi.spyOn(console, "error").mockImplementation(() => {});
      const addSpy = vi.fn().mockRejectedValue(error);
      const state = { ...defaultState(), addTransaction: addSpy };
      vi.spyOn(appStateModule, "useAppState").mockReturnValue(state);

      const user = userEvent.setup();
      render(<AppShell><div>Content</div></AppShell>);

      // Open sheet and fill form
      await user.click(screen.getByLabelText("Nova transação"));
      await user.type(screen.getByPlaceholderText("0,00"), "5000");
      await user.type(screen.getByPlaceholderText(/Aluguel, mercado/), "Teste");
      await user.click(screen.getByText("Alimentação"));
      await user.click(screen.getByText("Nubank"));

      // Save — will reject. The click handler rethrows the error as an
      // unhandled rejection (not propagated to the click caller).
      // Use a try-catch to swallow the unhandled rejection so we can verify
      // the sheet state after the save attempt.
      try {
        await user.click(screen.getByText("Salvar"));
      } catch {
        // swallow — rethrow is expected from handleSave
      }

      // Wait for re-render after rejected save
      await new Promise((r) => setTimeout(r, 50));

      // Sheet stays open so draft survives validation errors
      expect(screen.getByText("Novo lançamento")).toBeInTheDocument();
    });
  });

  describe("custom event preselected mode", () => {
    it("opens sheet with expense preselected when pwa:open-tx fires expense", async () => {
      render(<AppShell><div>Content</div></AppShell>);

      window.dispatchEvent(
        new CustomEvent("pwa:open-tx", { detail: { kind: "expense" } }),
      );

      // BottomSheet re-renders async after state update
      expect(await screen.findByText("Nova despesa")).toBeInTheDocument();
    });

    it("opens sheet with income preselected when pwa:open-tx fires income", async () => {
      render(<AppShell><div>Content</div></AppShell>);

      window.dispatchEvent(
        new CustomEvent("pwa:open-tx", { detail: { kind: "income" } }),
      );

      expect(await screen.findByText("Nova receita")).toBeInTheDocument();
    });

    it("opens sheet with transfer preselected when pwa:open-tx fires transfer", async () => {
      render(<AppShell><div>Content</div></AppShell>);

      window.dispatchEvent(
        new CustomEvent("pwa:open-tx", { detail: { kind: "transfer" } }),
      );

      expect(await screen.findByText("Nova transferência")).toBeInTheDocument();
    });

    it("ignores pwa:open-tx event with no kind", async () => {
      render(<AppShell><div>Content</div></AppShell>);

      window.dispatchEvent(new CustomEvent("pwa:open-tx", { detail: {} }));

      // No sheet should be open
      expect(screen.queryByText("Nova despesa")).not.toBeInTheDocument();
      expect(screen.queryByText("Novo lançamento")).not.toBeInTheDocument();
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
