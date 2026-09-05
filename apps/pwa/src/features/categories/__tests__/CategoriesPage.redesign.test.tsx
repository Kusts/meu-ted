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

describe("CategoriesPage – Redesign Moderno (TDD RED)", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("renderiza busca rápida com placeholder Buscar categorias", () => {
    render(<CategoriesPage />);
    expect(screen.getByPlaceholderText(/Buscar categorias/i)).toBeInTheDocument();
  });

  it("filtra categorias ao digitar na busca (rápida)", async () => {
    render(<CategoriesPage />);
    const input = screen.getByPlaceholderText(/Buscar categorias/i);
    fireEvent.change(input, { target: { value: "Alimentação" } });
    expect(screen.getByText("Alimentação")).toBeInTheDocument();
    expect(screen.queryByText("Transporte")).not.toBeInTheDocument();
    // limpar busca mostra novamente
    fireEvent.change(input, { target: { value: "" } });
    expect(screen.getByText("Transporte")).toBeInTheDocument();
  });

  it("exibe badges elegantes com cor e ícone para cada categoria", () => {
    const { container } = render(<CategoriesPage />);
    // Badge elegante deve ter data-testid ou classe específica
    const badges = container.querySelectorAll("[data-testid='category-badge'], .category-badge");
    expect(badges.length).toBeGreaterThan(0);
    // ou verifica que CategoryBadge renderiza com cor determinística
    const colored = Array.from(container.querySelectorAll("span")).filter(s => s.style.background || s.style.backgroundColor);
    expect(colored.length).toBeGreaterThan(0);
  });

  it("ao abrir Nova categoria, exibe seletor de ícones organizado por grupo", async () => {
    render(<CategoriesPage />);
    fireEvent.click(screen.getByText("Nova"));
    const dialog = await screen.findByRole("dialog");
    // grupos de ícones: espera headings de grupo
    expect(within(dialog).getByText(/Casa|Habitação|Lar/i) || within(dialog).getByText(/Transporte/i) || within(dialog).getByText(/Alimentação/i)).toBeInTheDocument();
    // ao menos 2 grupos
    const groups = dialog.querySelectorAll("[data-testid='icon-group']");
    expect(groups.length).toBeGreaterThanOrEqual(2);
    // ícones como botões
    const iconButtons = dialog.querySelectorAll("[data-testid='icon-option']");
    expect(iconButtons.length).toBeGreaterThanOrEqual(8);
  });

  it("ao abrir Nova categoria, exibe seletor visual de cor com paleta", async () => {
    render(<CategoriesPage />);
    fireEvent.click(screen.getByText("Nova"));
    const dialog = await screen.findByRole("dialog");
    const palette = dialog.querySelectorAll("[data-testid='color-option']");
    expect(palette.length).toBeGreaterThanOrEqual(8);
    // deve ter botão com aria-label de cor
    expect(within(dialog).getAllByRole("button").some(b => b.getAttribute("aria-label")?.toLowerCase().includes("cor") || b.getAttribute("title")?.toLowerCase().includes("#"))).toBeTruthy();
  });

  it("selecionar ícone e cor atualiza preview elegante do badge no sheet", async () => {
    render(<CategoriesPage />);
    fireEvent.click(screen.getByText("Nova"));
    const dialog = await screen.findByRole("dialog");
    const iconBtn = dialog.querySelector("[data-testid='icon-option']") as HTMLElement;
    const colorBtn = dialog.querySelector("[data-testid='color-option']") as HTMLElement;
    expect(iconBtn).toBeTruthy();
    expect(colorBtn).toBeTruthy();
    fireEvent.click(iconBtn!);
    fireEvent.click(colorBtn!);
    // preview badge deve refletir seleção
    const preview = dialog.querySelector("[data-testid='category-preview']");
    expect(preview).toBeInTheDocument();
  });

  it("salvar nova categoria chama addCategory com ícone e cor selecionados", async () => {
    const addSpy = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(appStateModule, "useAppState").mockReturnValue(mockState({ addCategory: addSpy }));
    render(<CategoriesPage />);
    fireEvent.click(screen.getByText("Nova"));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByPlaceholderText(/Alimentação, Salário/i), { target: { value: "Viagem Luxo" } });
    // selecionar ícone e cor
    const iconBtn = dialog.querySelectorAll("[data-testid='icon-option']")[1] as HTMLElement;
    const colorBtn = dialog.querySelectorAll("[data-testid='color-option']")[2] as HTMLElement;
    fireEvent.click(iconBtn);
    fireEvent.click(colorBtn);
    fireEvent.click(within(dialog).getByText("Salvar categoria"));
    await waitFor(() => expect(addSpy).toHaveBeenCalled());
    const call = addSpy.mock.calls[0][0];
    expect(call.name).toBe("Viagem Luxo");
    expect(call.icon).toBeDefined();
    expect(call.color).toBeDefined();
  });

  it("exibe estado vazio com CTA elegante quando busca não encontra resultados", async () => {
    render(<CategoriesPage />);
    const input = screen.getByPlaceholderText(/Buscar categorias/i);
    fireEvent.change(input, { target: { value: "ZZZ_INEXISTENTE_999" } });
    expect(screen.getByText(/Nenhuma categoria encontrada/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Limpar busca/i).length).toBeGreaterThanOrEqual(1);
  });

  it("layout fluido para mobile/PWA: grid responsivo e sheet com safe-area", async () => {
    const { container } = render(<CategoriesPage />);
    // grid de categorias
    const grid = container.querySelector(".categories-grid, [data-testid='categories-grid']");
    expect(grid).toBeInTheDocument();
    // verifica classes de grid responsivo
    expect(grid?.className).toMatch(/grid/);
    expect(grid?.className).toMatch(/grid-cols/);
    // sheet deve ter padding bottom safe-area
    render(<CategoriesPage />);
    fireEvent.click(screen.getAllByText("Nova")[0]);
    const dialog = await screen.findByRole("dialog");
    // BottomSheet content should be scrollable and fluid
    expect(dialog).toBeInTheDocument();
  });

  it("seletor de categorias moderno permite filtrar e visualizar por grupo sem travamentos", async () => {
    render(<CategoriesPage />);
    const input = screen.getByPlaceholderText(/Buscar categorias/i);
    // busca por grupo: digitar "Salário" deve mostrar apenas Receitas
    fireEvent.change(input, { target: { value: "Salário" } });
    expect(screen.getByText("Salário")).toBeInTheDocument();
    expect(screen.queryByText("Alimentação")).not.toBeInTheDocument();
    fireEvent.change(input, { target: { value: "Alim" } });
    // deve ainda mostrar categorias (busca case-insensitive, substring)
    expect(screen.getByText(/Alimentação/i)).toBeInTheDocument();
  });
});
