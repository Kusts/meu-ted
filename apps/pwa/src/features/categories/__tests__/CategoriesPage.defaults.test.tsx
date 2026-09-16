import { render, screen, fireEvent, within, waitFor } from "@/lib/test-utils";
import CategoriesPage from "../CategoriesPage";
import * as appStateModule from "@/lib/state/app-state-context";
import { mockAccounts, ALL_MOCK_TRANSACTIONS, mockPayables, mockBudgets, mockGoals } from "@/lib/state/mock-data";
import type { AppState } from "@/lib/state/app-state-context";
import type { Category } from "@/lib/state/types";

const treeCategories: Category[] = [
  { id: "m1", name: "Moradia", kind: "expense", icon: "Home", isDefault: true },
  { id: "s1", name: "Aluguel", kind: "expense", icon: "KeyRound", parentId: "m1" },
  { id: "m2", name: "Renda", kind: "income", icon: "Wallet", isDefault: true },
  { id: "s2", name: "Salário", kind: "income", icon: "Banknote", parentId: "m2" },
  { id: "m3", name: "Transporte", kind: "expense", icon: "Car" },
];

function defaultState(): AppState {
  return {
    accounts: [...mockAccounts], categories: [...treeCategories],
    transactions: [...ALL_MOCK_TRANSACTIONS], payables: [...mockPayables],
    budgets: [...mockBudgets], goals: [...mockGoals],
    debts: [], subscriptions: [], loading: false, error: null,
    addTransaction: vi.fn(), deleteTransaction: vi.fn(), markPayablePaid: vi.fn(), cancelPayable: vi.fn(), createPayable: vi.fn(), createBudget: vi.fn(), updateBudget: vi.fn(), createGoal: vi.fn(), contributeToGoal: vi.fn(), cancelGoal: vi.fn(),
    cardStatements: [], writeError: null, clearWriteError: vi.fn(),
    profile: null, dashboardSummary: null,
    saveProfile: vi.fn(), refreshProfile: vi.fn(), refreshDashboardSummary: vi.fn(),
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
    deleteCategory: vi.fn(), applyCategoryDefaults: vi.fn(),
    addCard: vi.fn(), updateCard: vi.fn(),
    addSubscription: vi.fn(), cancelSubscription: vi.fn(),
    createTransfer: vi.fn(), payStatement: vi.fn(), createInstallments: vi.fn(),
    createCardPurchase: vi.fn(), updateTransaction: vi.fn(), updatePayable: vi.fn(),
    undoPayablePayment: vi.fn(), updateGoal: vi.fn(), updateSubscription: vi.fn(),
    refreshSubscriptions: vi.fn(), refreshDomains: vi.fn(),
    offlineLocked: false,
    revalidateOfflineSession: vi.fn(),
  };
}
function mockState(o: Partial<AppState>): AppState { return { ...defaultState(), ...o }; }

describe("CategoriesPage — macros, defaults e exclusão (item 11)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(appStateModule, "useAppState").mockReturnValue(mockState({}));
  });

  it("agrupa subs-objeto sob a macro e exibe badge Default", () => {
    render(<CategoriesPage />);
    expect(screen.getByText("Moradia")).toBeInTheDocument();
    expect(screen.getByText("Aluguel")).toBeInTheDocument();
    expect(screen.getAllByText("Default").length).toBe(2);
  });

  it("expande/recolhe subs pela seta da macro", () => {
    render(<CategoriesPage />);
    const toggle = screen.getByRole("button", { name: "Alternar subcategorias de Moradia" });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(toggle);
    expect(screen.queryByText("Aluguel")).not.toBeInTheDocument();
    fireEvent.click(toggle);
    expect(screen.getByText("Aluguel")).toBeInTheDocument();
  });

  it("busca encontra macro por nome de sub-objeto", () => {
    render(<CategoriesPage />);
    fireEvent.change(screen.getByPlaceholderText(/Buscar categorias/i), { target: { value: "Aluguel" } });
    expect(screen.getByText("Moradia")).toBeInTheDocument();
    expect(screen.queryByText("Renda")).not.toBeInTheDocument();
  });

  it("aplica defaults em todas as contas e mostra resumo", async () => {
    const applySpy = vi.fn().mockResolvedValue({ created: 60, skipped: 0 });
    vi.spyOn(appStateModule, "useAppState").mockReturnValue(mockState({ applyCategoryDefaults: applySpy }));
    render(<CategoriesPage />);
    fireEvent.click(screen.getByRole("button", { name: /Aplicar categorias padrão em todas as contas/ }));
    await waitFor(() => expect(applySpy).toHaveBeenCalled());
    expect(await screen.findByText(/60 categorias criadas/)).toBeInTheDocument();
  });

  it("excluir macro abre sheet com mover e cascata; mover exige destino", async () => {
    const deleteSpy = vi.fn().mockResolvedValue({ movedTransactions: 2, softDeletedTransactions: 0 });
    vi.spyOn(appStateModule, "useAppState").mockReturnValue(mockState({ deleteCategory: deleteSpy }));
    render(<CategoriesPage />);
    fireEvent.click(screen.getByRole("button", { name: "Excluir categoria Moradia" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Excluir categoria")).toBeInTheDocument();
    // Confirmar sem destino não faz nada.
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirmar exclusão" }));
    expect(deleteSpy).not.toHaveBeenCalled();
    // Com destino, move.
    fireEvent.change(within(dialog).getByLabelText("Categoria de destino"), { target: { value: "m3" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirmar exclusão" }));
    await waitFor(() => expect(deleteSpy).toHaveBeenCalledWith("m1", { mode: "move", destinationCategoryId: "m3" }));
    expect(await screen.findByText(/2 lançamento\(s\) movidos/)).toBeInTheDocument();
  });

  it("cascata exige checkbox de confirmação explícita", async () => {
    const deleteSpy = vi.fn().mockResolvedValue({ movedTransactions: 0, softDeletedTransactions: 1 });
    vi.spyOn(appStateModule, "useAppState").mockReturnValue(mockState({ deleteCategory: deleteSpy }));
    render(<CategoriesPage />);
    fireEvent.click(screen.getByRole("button", { name: "Excluir categoria Moradia" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /Excluir lançamentos junto/ }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirmar exclusão" }));
    expect(deleteSpy).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByText(/confirmo a exclusão em cascata/));
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirmar exclusão" }));
    await waitFor(() => expect(deleteSpy).toHaveBeenCalledWith("m1", { mode: "cascade", confirm: true }));
  });

  it("editar com ícone alterado envia icon; sem alteração envia só o nome", async () => {
    const updateSpy = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(appStateModule, "useAppState").mockReturnValue(mockState({ updateCategory: updateSpy }));
    render(<CategoriesPage />);
    fireEvent.click(screen.getAllByText("Editar")[0]);
    const dialog = await screen.findByRole("dialog");
    const firstIcon = dialog.querySelector("[data-testid='icon-option']") as HTMLElement;
    fireEvent.click(firstIcon);
    fireEvent.click(within(dialog).getByText("Salvar"));
    await waitFor(() => expect(updateSpy).toHaveBeenCalled());
    const payload = updateSpy.mock.calls[0][1] as { name: string; icon?: string };
    expect(payload.name).toBe("Moradia");
    expect(payload.icon).toBeDefined();
  });

  it("IconPicker com busca filtra por rótulo pt-BR", async () => {
    render(<CategoriesPage />);
    fireEvent.click(screen.getByText("Nova"));
    const dialog = await screen.findByRole("dialog");
    const search = within(dialog).getByLabelText("Buscar símbolo");
    fireEvent.change(search, { target: { value: "uber" } });
    await waitFor(() => {
      const options = dialog.querySelectorAll("[data-testid='icon-option']");
      expect(options.length).toBeGreaterThan(0);
      expect(options.length).toBeLessThan(40);
    });
  });
});
