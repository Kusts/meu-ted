import { render, screen, within, fireEvent, waitForElementToBeRemoved } from "@/lib/test-utils";
import userEvent from "@testing-library/user-event";
import GoalsPage from "../GoalsPage";
import * as appStateModule from "@/lib/state/app-state-context";
import { mockAccounts, mockCategories, ALL_MOCK_TRANSACTIONS, mockPayables, mockBudgets, mockGoals, mockDebts } from "@/lib/state/mock-data";
import type { AppState } from "@/lib/state/app-state-context";

function defaultState(): AppState {
  return {
    accounts: [...mockAccounts], categories: [...mockCategories],
    transactions: [...ALL_MOCK_TRANSACTIONS], payables: [...mockPayables],
    budgets: [...mockBudgets], goals: [...mockGoals],
    debts: [...mockDebts],
    subscriptions: [], loading: false, error: null,
    addTransaction: vi.fn(), deleteTransaction: vi.fn(), markPayablePaid: vi.fn(), cancelPayable: vi.fn(), createPayable: vi.fn(), createBudget: vi.fn(), updateBudget: vi.fn(), createGoal: vi.fn(), updateGoal: vi.fn(), contributeToGoal: vi.fn(), cancelGoal: vi.fn(),
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

describe("GoalsPage", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  describe("with data", () => {
    it("renders page header", () => { render(<GoalsPage />); expect(screen.getByText("Metas & Dívidas")).toBeInTheDocument(); });
    it("renders goal cards", () => { render(<GoalsPage />); const reserva = screen.getAllByText("Reserva de emergência"); expect(reserva.length).toBeGreaterThanOrEqual(1); expect(screen.getByText("Viagem fim de ano")).toBeInTheDocument(); });
    it("shows percentages", () => { render(<GoalsPage />); expect(screen.getByText("25.0%")).toBeInTheDocument(); expect(screen.getByText("26.7%")).toBeInTheDocument(); });
    it("shows current/target amounts", () => { render(<GoalsPage />); expect(screen.getByText(/1\.500,\d{2}/)).toBeInTheDocument(); expect(screen.getByText(/6\.000,\d{2}/)).toBeInTheDocument(); });
    it("switches to Dívidas tab", async () => { const user = userEvent.setup(); render(<GoalsPage />); await user.click(screen.getByText("Dívidas")); expect(screen.getByText("Financiamento Carro")).toBeInTheDocument(); });
    it("active Metas tab by default", () => { render(<GoalsPage />); expect(screen.getByText("Metas")).toBeInTheDocument(); });
  });

  describe("loading", () => {
    it("shows loading indicator", () => { vi.spyOn(appStateModule, "useAppState").mockReturnValue(mockState({ loading: true })); render(<GoalsPage />); expect(screen.getByText(/carregando/i)).toBeInTheDocument(); expect(screen.queryByText("Metas")).not.toBeInTheDocument(); });
  });

  describe("error", () => {
    it("shows error banner alongside data", () => { vi.spyOn(appStateModule, "useAppState").mockReturnValue(mockState({ error: "Erro API" })); render(<GoalsPage />); expect(screen.getByText(/Erro API/i)).toBeInTheDocument(); expect(screen.getByText("Metas")).toBeInTheDocument(); });
  });

  describe("debts tab — no debts", () => {
    it("shows empty state when debts is empty", async () => {
      vi.spyOn(appStateModule, "useAppState").mockReturnValue(
        mockState({ goals: [], debts: [] }),
      );
      const user = userEvent.setup();
      render(<GoalsPage />);
      await user.click(screen.getByText("Dívidas"));
      expect(
        screen.getByText(/Nenhuma dívida/i),
      ).toBeInTheDocument();
    });
  });

  describe("dead CTA signals", () => {
    it("opens new goal form when Nova is clicked (chooser then meta)", async () => {
      const user = userEvent.setup();
      render(<GoalsPage />);
      await user.click(screen.getByText("Nova"));
      await user.click(screen.getByText("Meta financeira"));
      expect(screen.getByText("Nova meta")).toBeInTheDocument();
      expect(screen.getByText("Salvar meta")).toBeInTheDocument();
    });
  });

  describe("draft persistence (no leak across close/reopen)", () => {
    it("contribute sheet does not leak amount across close + reopen", async () => {
      const user = userEvent.setup();
      render(<GoalsPage />);
      const addBtns = screen.getAllByRole("button", { name: /^Adicionar$/ });
      await user.click(addBtns[0]!);

      const amountInput = screen.getByPlaceholderText("0,00") as HTMLInputElement;
      await user.type(amountInput, "12345");
      expect(amountInput.value).toBe("123,45");

      // Close via the bottom sheet's outside-click overlay.
      await user.keyboard("{Escape}");
      await user.click(document.body);
      // Exit animation must finish before reopening.
      await waitForElementToBeRemoved(() => screen.queryByRole("dialog"));

      // Reopen — amount must be empty.
      const addBtns2 = screen.getAllByRole("button", { name: /^Adicionar$/ });
      await user.click(addBtns2[0]!);
      const reopenedAmount = screen.getByPlaceholderText("0,00") as HTMLInputElement;
      expect(reopenedAmount.value).toBe("");
    });

    it("new goal sheet does not leak name or target across close + reopen", async () => {
      const user = userEvent.setup();
      render(<GoalsPage />);
      await user.click(screen.getByText("Nova"));
      await user.click(screen.getByText("Meta financeira"));

      const nameInput = screen.getByPlaceholderText(/Viagem/i) as HTMLInputElement;
      await user.type(nameInput, "Draft Test Goal");
      const targetInput = screen.getByPlaceholderText("0,00") as HTMLInputElement;
      await user.type(targetInput, "99999");

      // Close via Escape.
      await user.keyboard("{Escape}");
      // Exit animation must finish before reopening.
      await waitForElementToBeRemoved(() => screen.queryByRole("dialog"));

      // Reopen — both fields must be empty.
      await user.click(screen.getByText("Nova"));
      await user.click(screen.getByText("Meta financeira"));
      expect((screen.getByPlaceholderText(/Viagem/i) as HTMLInputElement).value).toBe("");
      expect((screen.getByPlaceholderText("0,00") as HTMLInputElement).value).toBe("");
    });
  });

  describe("debt goals appear in Dívidas tab", () => {
    it("shows goal of type debt_payoff in Dívidas tab", async () => {
      const user = userEvent.setup();
      vi.spyOn(appStateModule, "useAppState").mockReturnValue(
        mockState({
          goals: [
            { id: "debt-g1", name: "Empréstimo Banco", goalType: "debt_payoff", targetAmountCents: 500000, currentAmountCents: 100000, startDate: "2026-01-01", status: "active" },
          ],
          debts: [],
        }),
      );
      render(<GoalsPage />);
      await user.click(screen.getByText("Dívidas"));
      expect(screen.getByText("Empréstimo Banco")).toBeInTheDocument();
    });

    it("debt-goal card in Dívidas tab is clickable and opens detail", async () => {
      const user = userEvent.setup();
      vi.spyOn(appStateModule, "useAppState").mockReturnValue(
        mockState({
          goals: [
            { id: "debt-g1", name: "Empréstimo Banco", goalType: "debt_payoff", targetAmountCents: 500000, currentAmountCents: 100000, startDate: "2026-01-01", status: "active" },
          ],
          debts: [],
        }),
      );
      render(<GoalsPage />);
      await user.click(screen.getByText("Dívidas"));
      await user.click(screen.getByText("Empréstimo Banco"));
      expect(screen.getByText("Editar")).toBeInTheDocument();
    });

    it("debt-goal card in Dívidas shows Adicionar and Cancelar buttons", async () => {
      vi.spyOn(appStateModule, "useAppState").mockReturnValue(
        mockState({
          goals: [
            { id: "debt-g1", name: "Empréstimo Banco", goalType: "debt_payoff", targetAmountCents: 500000, currentAmountCents: 100000, startDate: "2026-01-01", status: "active" },
          ],
          debts: [],
        }),
      );
      const user = userEvent.setup();
      render(<GoalsPage />);
      await user.click(screen.getByText("Dívidas"));
      const addBtns = screen.getAllByRole("button", { name: /^Adicionar$/ });
      const cancelBtns = screen.getAllByRole("button", { name: /^Cancelar$/ });
      expect(addBtns.length).toBeGreaterThanOrEqual(1);
      expect(cancelBtns.length).toBeGreaterThanOrEqual(1);
    });

    it("clicking Adicionar on debt-goal opens contribution sheet", async () => {
      vi.spyOn(appStateModule, "useAppState").mockReturnValue(
        mockState({
          goals: [
            { id: "debt-g1", name: "Empréstimo Banco", goalType: "debt_payoff", targetAmountCents: 500000, currentAmountCents: 100000, startDate: "2026-01-01", status: "active" },
          ],
          debts: [],
        }),
      );
      const user = userEvent.setup();
      render(<GoalsPage />);
      await user.click(screen.getByText("Dívidas"));
      await user.click(screen.getAllByRole("button", { name: /^Adicionar$/ })[0]);
      expect(screen.getByText("Adicionar valor")).toBeInTheDocument();
    });

    it("clicking Cancelar on debt-goal opens confirm dialog", async () => {
      vi.spyOn(appStateModule, "useAppState").mockReturnValue(
        mockState({
          goals: [
            { id: "debt-g1", name: "Empréstimo Banco", goalType: "debt_payoff", targetAmountCents: 500000, currentAmountCents: 100000, startDate: "2026-01-01", status: "active" },
          ],
          debts: [],
        }),
      );
      const user = userEvent.setup();
      render(<GoalsPage />);
      await user.click(screen.getByText("Dívidas"));
      await user.click(screen.getAllByRole("button", { name: /^Cancelar$/ })[0]);
      expect(screen.getByText(/Tem certeza/i)).toBeInTheDocument();
    });
  });

  describe("new goal/debt creation chooser and detail sheet", () => {
    it("Novo opens chooser with Meta financeira and Dívida", async () => {
      const user = userEvent.setup();
      render(<GoalsPage />);
      await user.click(screen.getByText("Nova"));
      await screen.findByText("Meta financeira");
      expect(screen.getByText("Meta financeira")).toBeInTheDocument();
      expect(screen.getByText("Dívida")).toBeInTheDocument();
    });

    it("choosing Dívida preselects debt_payoff type", async () => {
      const user = userEvent.setup();
      const createSpy = vi.fn();
      vi.spyOn(appStateModule, "useAppState").mockReturnValue(mockState({ createGoal: createSpy }));
      render(<GoalsPage />);
      await user.click(screen.getByText("Nova"));
      await user.click(screen.getByText("Dívida"));
      const nameInput = screen.getByPlaceholderText(/Viagem/i);
      await user.type(nameInput, "Teste Dívida");
      const targetInput = screen.getByPlaceholderText("0,00");
      await user.type(targetInput, "100000");
      await user.click(screen.getByText("Salvar meta"));
      expect(createSpy).toHaveBeenCalledWith(expect.objectContaining({
        goalType: "debt_payoff",
        name: "Teste Dívida",
        targetAmountCents: 100000,
      }));
    });

    it("clicking goal card opens detail sheet", async () => {
      const user = userEvent.setup();
      render(<GoalsPage />);
      const allReserva = screen.getAllByText("Reserva de emergência");
      await user.click(allReserva[0]);
      expect(screen.getByText("Editar")).toBeInTheDocument();
    });

    it("editMode persists when changing name — save button stays visible", async () => {
      const updateSpy = vi.fn();
      vi.spyOn(appStateModule, "useAppState").mockReturnValue(mockState({ updateGoal: updateSpy }));
      const user = userEvent.setup();
      render(<GoalsPage />);
      // Open detail
      await user.click(screen.getAllByText("Reserva de emergência")[0]);
      await user.click(screen.getByText("Editar"));
      // Salvar alterações must be visible immediately after entering edit mode
      const saveBtn = screen.getByText("Salvar alterações");
      expect(saveBtn).toBeInTheDocument();
      // Change name
      const nameInput = screen.getByDisplayValue("Reserva de emergência");
      await user.clear(nameInput);
      await user.type(nameInput, "Reserva Editada");
      // Salvar alterações must STILL be visible — editMode was not reset
      expect(screen.getByText("Salvar alterações")).toBeInTheDocument();
      // Save and confirm update was called
      await user.click(screen.getByText("Salvar alterações"));
      expect(updateSpy).toHaveBeenCalled();
    });


    it("inline Adicionar and Cancelar buttons remain on goal cards", async () => {
      render(<GoalsPage />);
      const addBtns = screen.getAllByRole("button", { name: /^Adicionar$/ });
      expect(addBtns.length).toBeGreaterThanOrEqual(1);
      const cancelBtns = screen.getAllByRole("button", { name: /^Cancelar$/ });
      expect(cancelBtns.length).toBeGreaterThanOrEqual(1);
    });

    it("debts tab no longer shows 'Em breve'", async () => {
      const user = userEvent.setup();
      render(<GoalsPage />);
      await user.click(screen.getByText("Dívidas"));
      expect(screen.queryAllByText("Em breve").length).toBe(0);
    });
  });

  describe("save/contribute/cancel handlers", () => {
    it("contributes to a goal", async () => {
      const contribSpy = vi.fn();
      vi.spyOn(appStateModule, "useAppState").mockReturnValue(mockState({ contributeToGoal: contribSpy }));
      const user = userEvent.setup();
      render(<GoalsPage />);
      const addBtns = screen.getAllByRole("button", { name: /^Adicionar$/ });
      await user.click(addBtns[0]);
      const amountInput = screen.getByPlaceholderText("0,00");
      await user.type(amountInput, "12345");
      const dialog = screen.getByRole("dialog");
      await user.click(within(dialog).getByRole("button", { name: "Adicionar" }));
      expect(contribSpy).toHaveBeenCalled();
    });

    it("edits a goal and saves", async () => {
      const updateSpy = vi.fn();
      vi.spyOn(appStateModule, "useAppState").mockReturnValue(mockState({ updateGoal: updateSpy }));
      const user = userEvent.setup();
      render(<GoalsPage />);
      await user.click(screen.getAllByText("Reserva de emergência")[0]);
      await user.click(screen.getByText("Editar"));
      const nameInput = screen.getByDisplayValue("Reserva de emergência");
      await user.clear(nameInput);
      await user.type(nameInput, "Reserva Editada");
      await user.click(screen.getByText("Salvar alterações"));
      expect(updateSpy).toHaveBeenCalled();
    });

    it("cancels a goal via the confirm dialog", async () => {
      const cancelSpy = vi.fn();
      vi.spyOn(appStateModule, "useAppState").mockReturnValue(mockState({ cancelGoal: cancelSpy }));
      const user = userEvent.setup();
      render(<GoalsPage />);
      const cancelBtns = screen.getAllByRole("button", { name: /^Cancelar$/ });
      await user.click(cancelBtns[0]);
      await user.click(screen.getByRole("button", { name: "Cancelar meta" }));
      expect(cancelSpy).toHaveBeenCalled();
    });
  });

  describe("guard branches (coverage)", () => {
    it("new goal: does not save when name is empty", async () => {
      const createSpy = vi.fn();
      vi.spyOn(appStateModule, "useAppState").mockReturnValue(mockState({ createGoal: createSpy }));
      const user = userEvent.setup();
      render(<GoalsPage />);
      await user.click(screen.getByText("Nova"));
      await user.click(screen.getByText("Meta financeira"));
      await user.type(screen.getByPlaceholderText("0,00"), "100000");
      await user.click(screen.getByText("Salvar meta"));
      expect(createSpy).not.toHaveBeenCalled();
    });

    it("new goal: does not save when target is zero", async () => {
      const createSpy = vi.fn();
      vi.spyOn(appStateModule, "useAppState").mockReturnValue(mockState({ createGoal: createSpy }));
      const user = userEvent.setup();
      render(<GoalsPage />);
      await user.click(screen.getByText("Nova"));
      await user.click(screen.getByText("Meta financeira"));
      await user.type(screen.getByPlaceholderText(/Viagem/i), "Sem alvo");
      await user.click(screen.getByText("Salvar meta"));
      expect(createSpy).not.toHaveBeenCalled();
    });

    it("contribute: does not contribute when amount is empty", async () => {
      const contribSpy = vi.fn();
      vi.spyOn(appStateModule, "useAppState").mockReturnValue(mockState({ contributeToGoal: contribSpy }));
      const user = userEvent.setup();
      render(<GoalsPage />);
      const addBtns = screen.getAllByRole("button", { name: /^Adicionar$/ });
      await user.click(addBtns[0]);
      await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Adicionar" }));
      expect(contribSpy).not.toHaveBeenCalled();
    });

    it("detail edit: saving with empty name sends undefined name", async () => {
      const updateSpy = vi.fn();
      vi.spyOn(appStateModule, "useAppState").mockReturnValue(mockState({ updateGoal: updateSpy }));
      const user = userEvent.setup();
      render(<GoalsPage />);
      await user.click(screen.getAllByText("Reserva de emergência")[0]);
      await user.click(screen.getByText("Editar"));
      const nameInput = screen.getByDisplayValue("Reserva de emergência") as HTMLInputElement;
      await user.clear(nameInput);
      await user.click(screen.getByText("Salvar alterações"));
      expect(updateSpy).toHaveBeenCalled();
    });
  });
});

describe("GoalsPage — P2-14 (cards keyboard-accessible)", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it("exposes goal cards as keyboard-accessible buttons that open the detail", () => {
    vi.spyOn(appStateModule, "useAppState").mockReturnValue(mockState({}));
    render(<GoalsPage />);
    const card = screen.getByRole("button", { name: /Ver detalhes de Reserva de emergência/i });
    expect(card).toHaveAttribute("tabindex", "0");
    fireEvent.keyDown(card, { key: "Enter" });
    expect(screen.getByText("Detalhes da meta")).toBeInTheDocument();
  });
});
