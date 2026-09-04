import { render, screen, fireEvent, within, waitFor } from "@/lib/test-utils";
import CategoriesPage from "../CategoriesPage";
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

describe("CategoriesPage", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  describe("with data", () => {
    it("renders page header", () => { render(<CategoriesPage />); expect(screen.getByText("Categorias")).toBeInTheDocument(); });
    it("renders Despesas section", () => { render(<CategoriesPage />); expect(screen.getByText("Despesas")).toBeInTheDocument(); });
    it("renders Receitas section", () => { render(<CategoriesPage />); expect(screen.getByText("Receitas")).toBeInTheDocument(); });
    it("renders expense category names", () => { render(<CategoriesPage />); expect(screen.getByText("Alimentação")).toBeInTheDocument(); expect(screen.getByText("Transporte")).toBeInTheDocument(); expect(screen.getByText("Moradia")).toBeInTheDocument(); });
    it("renders income category names", () => { render(<CategoriesPage />); expect(screen.getByText("Salário")).toBeInTheDocument(); expect(screen.getByText("Freelas")).toBeInTheDocument(); });
    it("renders subcategory chips without fake remove button", () => {
      render(<CategoriesPage />);
      expect(screen.getByText("Mercado")).toBeInTheDocument();
      expect(screen.getByText("Restaurante")).toBeInTheDocument();
      expect(screen.getByText("Ifood")).toBeInTheDocument();
      // Remove button (×) must NOT exist — no real backend support for subcategory deletion
      expect(screen.queryByLabelText(/Remover/)).not.toBeInTheDocument();
    });
    it("renders + Sub buttons", () => { render(<CategoriesPage />); expect(screen.getAllByText("+ Sub").length).toBeGreaterThan(0); });
  });

  describe("loading", () => {
    it("shows loading indicator", () => { vi.spyOn(appStateModule, "useAppState").mockReturnValue(mockState({ loading: true })); render(<CategoriesPage />); expect(screen.getByText(/carregando/i)).toBeInTheDocument(); expect(screen.queryByText("Despesas")).not.toBeInTheDocument(); });
  });

  describe("error", () => {
    it("shows error banner alongside data", () => { vi.spyOn(appStateModule, "useAppState").mockReturnValue(mockState({ error: "API error" })); render(<CategoriesPage />); expect(screen.getByText(/API error/i)).toBeInTheDocument(); expect(screen.getByText("Despesas")).toBeInTheDocument(); });
  });

  describe("category actions", () => {
    it("shows edit and desativar buttons on each category", () => {
      render(<CategoriesPage />);
      expect(screen.getAllByText("Editar").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Desativar").length).toBeGreaterThan(0);
    });

    it("opens edit sheet when editar is clicked", () => {
      render(<CategoriesPage />);
      fireEvent.click(screen.getAllByText("Editar")[0]);
      expect(screen.getByText("Salvar")).toBeInTheDocument();
    });

    it("opens confirm dialog when desativar is clicked", async () => {
      render(<CategoriesPage />);
      expect(screen.getAllByText("Desativar").length).toBeGreaterThan(0);
      fireEvent.click(screen.getAllByText("Desativar")[0]);
      expect(await screen.findByText("Desativar categoria")).toBeInTheDocument();
    });
  });

  describe("category icon consistency", () => {
    it("renders initial-letter badge instead of CategoryIconView for category rows", () => {
      const { container } = render(<CategoriesPage />);
      // Category row icons are now aria-hidden spans with initial letters
      const badges = Array.from(container.querySelectorAll("span")).filter(
        (s) => s.getAttribute("aria-hidden") === "true",
      );
      expect(badges.length).toBeGreaterThanOrEqual(3);
      badges.forEach((s) => {
        expect(s.textContent).toMatch(/^[A-ZÀ-Ú]$/);
      });
    });

    it("new category sheet no longer shows fake icon/color picker controls", () => {
      render(<CategoriesPage />);
      fireEvent.click(screen.getByText("Nova"));
      // Ícone and Cor pickers should be gone (they were never persisted)
      expect(screen.queryByText("Ícone")).not.toBeInTheDocument();
      expect(screen.queryByText("Cor")).not.toBeInTheDocument();
    });
  });

  describe("visual", () => {
    it("renders category icons without emoji characters", () => {
      const { container } = render(<CategoriesPage />);
      // All SVG icons (no emoji spans with text-only content)
      const svgs = container.querySelectorAll("svg");
      expect(svgs.length).toBeGreaterThan(0);
      // No emoji spans with food/transport/heart characters
      const spans = container.querySelectorAll("span");
      for (const s of spans) {
        const txt = s.textContent ?? "";
        if (txt.length === 1 || txt.length === 2) {
          // Should not contain emoji codepoints
          const code = txt.codePointAt(0) ?? 0;
          expect(code).not.toBeGreaterThan(0x1f300); // below emoji range
        }
      }
    });
  });

  describe("create / edit / deactivate / subcategory flows (coverage)", () => {
    it("opens Nova categoria sheet, fills name + income kind, and saves", () => {
      const addSpy = vi.fn();
      vi.spyOn(appStateModule, "useAppState").mockReturnValue(mockState({ addCategory: addSpy }));
      render(<CategoriesPage />);
      fireEvent.click(screen.getByText("Nova"));
      const dialog = screen.getByRole("dialog");
      fireEvent.change(within(dialog).getByPlaceholderText(/Alimentação, Salário/i), { target: { value: "Viagem" } });
      fireEvent.click(within(dialog).getByText("Receita"));
      fireEvent.click(within(dialog).getByText("Salvar categoria"));
      expect(addSpy).toHaveBeenCalledWith(expect.objectContaining({ name: "Viagem", kind: "income" }));
    });

    it("does not save category with empty name", () => {
      const addSpy = vi.fn();
      vi.spyOn(appStateModule, "useAppState").mockReturnValue(mockState({ addCategory: addSpy }));
      render(<CategoriesPage />);
      fireEvent.click(screen.getByText("Nova"));
      fireEvent.click(within(screen.getByRole("dialog")).getByText("Salvar categoria"));
      expect(addSpy).not.toHaveBeenCalled();
    });

    it("adds a subcategory via + Sub and OK button", () => {
      const addSpy = vi.fn();
      vi.spyOn(appStateModule, "useAppState").mockReturnValue(mockState({ addCategory: addSpy }));
      render(<CategoriesPage />);
      const subBtns = screen.getAllByText("+ Sub");
      fireEvent.click(subBtns[0]);
      const input = screen.getByPlaceholderText(/Nome da subcategoria/i);
      fireEvent.change(input, { target: { value: "Padaria" } });
      fireEvent.click(screen.getByText("OK"));
      expect(addSpy).toHaveBeenCalledWith(expect.objectContaining({ name: "Padaria", parentId: "cat1" }));
    });

    it("adds a subcategory via Enter key", () => {
      const addSpy = vi.fn();
      vi.spyOn(appStateModule, "useAppState").mockReturnValue(mockState({ addCategory: addSpy }));
      render(<CategoriesPage />);
      const subBtns = screen.getAllByText("+ Sub");
      fireEvent.click(subBtns[0]);
      const input = screen.getByPlaceholderText(/Nome da subcategoria/i) as HTMLInputElement;
      fireEvent.change(input, { target: { value: "Padaria" } });
      fireEvent.keyDown(input, { key: "Enter" });
      expect(addSpy).toHaveBeenCalledWith(expect.objectContaining({ name: "Padaria", parentId: "cat1" }));
    });

    it("cancels subcategory input via Escape", () => {
      render(<CategoriesPage />);
      const subBtns = screen.getAllByText("+ Sub");
      fireEvent.click(subBtns[0]);
      const input = screen.getByPlaceholderText(/Nome da subcategoria/i) as HTMLInputElement;
      fireEvent.change(input, { target: { value: "Padaria" } });
      fireEvent.keyDown(input, { key: "Escape" });
      expect(screen.queryByPlaceholderText(/Nome da subcategoria/i)).not.toBeInTheDocument();
    });

    it("edits a category and saves", () => {
      const updateSpy = vi.fn();
      vi.spyOn(appStateModule, "useAppState").mockReturnValue(mockState({ updateCategory: updateSpy }));
      render(<CategoriesPage />);
      fireEvent.click(screen.getAllByText("Editar")[0]);
      const input = screen.getByDisplayValue("Alimentação") as HTMLInputElement;
      fireEvent.change(input, { target: { value: "Comida" } });
      fireEvent.click(screen.getByText("Salvar"));
      expect(updateSpy).toHaveBeenCalledWith("cat1", { name: "Comida" });
    });

    it("does not save category edit with empty name", () => {
      const updateSpy = vi.fn();
      vi.spyOn(appStateModule, "useAppState").mockReturnValue(mockState({ updateCategory: updateSpy }));
      render(<CategoriesPage />);
      fireEvent.click(screen.getAllByText("Editar")[0]);
      const input = screen.getByDisplayValue("Alimentação") as HTMLInputElement;
      fireEvent.change(input, { target: { value: "" } });
      fireEvent.click(screen.getByText("Salvar"));
      expect(updateSpy).not.toHaveBeenCalled();
    });

    it("deactivates a category via confirm dialog", async () => {
      const deactSpy = vi.fn();
      vi.spyOn(appStateModule, "useAppState").mockReturnValue(mockState({ deactivateCategory: deactSpy }));
      render(<CategoriesPage />);
      fireEvent.click(screen.getAllByText("Desativar")[0]);
      const dialog = await screen.findByRole("dialog");
      fireEvent.click(within(dialog).getByRole("button", { name: "Desativar" }));
      expect(deactSpy).toHaveBeenCalledWith("cat1");
    });
  });

  describe("empty states & labels (coverage)", () => {
    it("shows empty state when no expense/income categories", () => {
      vi.spyOn(appStateModule, "useAppState").mockReturnValue(mockState({ categories: [] }));
      render(<CategoriesPage />);
      expect(screen.getByText("Nenhuma categoria de despesa.")).toBeInTheDocument();
      expect(screen.getByText("Nenhuma categoria de receita.")).toBeInTheDocument();
    });

    it("renders singular label with exactly one category of each kind", () => {
      vi.spyOn(appStateModule, "useAppState").mockReturnValue(mockState({
        categories: [
          { id: "c1", name: "Alimentação", kind: "expense" as any, subcategories: [] }, // eslint-disable-line @typescript-eslint/no-explicit-any
          { id: "c2", name: "Salário", kind: "income" as any }, // eslint-disable-line @typescript-eslint/no-explicit-any
        ],
      }));
      render(<CategoriesPage />);
      expect(screen.getAllByText("1 categoria").length).toBe(2);
    });
  });
});

describe("CategoriesPage — P2-3 (sheets stay open on rejected mutation)", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it("keeps the new category sheet open and preserves the name when addCategory rejects", async () => {
    const addSpy = vi.fn().mockRejectedValue(new Error("falha de rede"));
    vi.spyOn(appStateModule, "useAppState").mockReturnValue(mockState({ addCategory: addSpy }));
    render(<CategoriesPage />);
    fireEvent.click(screen.getByText("Nova"));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByPlaceholderText(/Alimentação, Salário/i), { target: { value: "Nova Cat" } });
    fireEvent.click(within(dialog).getByText("Salvar categoria"));
    await waitFor(() => expect(addSpy).toHaveBeenCalled());
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(within(screen.getByRole("dialog")).getByPlaceholderText(/Alimentação, Salário/i)).toHaveValue("Nova Cat");
  });

  it("closes the new category sheet only after a successful save", async () => {
    const addSpy = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(appStateModule, "useAppState").mockReturnValue(mockState({ addCategory: addSpy }));
    render(<CategoriesPage />);
    fireEvent.click(screen.getByText("Nova"));
    fireEvent.change(within(screen.getByRole("dialog")).getByPlaceholderText(/Alimentação, Salário/i), { target: { value: "Nova Cat" } });
    fireEvent.click(within(screen.getByRole("dialog")).getByText("Salvar categoria"));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(addSpy).toHaveBeenCalledWith({ name: "Nova Cat", kind: "expense" });
  });

  it("keeps the edit category sheet open and preserves the name when updateCategory rejects", async () => {
    const updateSpy = vi.fn().mockRejectedValue(new Error("erro de salvamento"));
    vi.spyOn(appStateModule, "useAppState").mockReturnValue(mockState({ updateCategory: updateSpy }));
    render(<CategoriesPage />);
    fireEvent.click(screen.getAllByText("Editar")[0]);
    const input = screen.getByDisplayValue("Alimentação") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Alimentação Editada" } });
    fireEvent.click(screen.getByText("Salvar"));
    await waitFor(() => expect(updateSpy).toHaveBeenCalled());
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Alimentação Editada")).toBeInTheDocument();
  });
});
