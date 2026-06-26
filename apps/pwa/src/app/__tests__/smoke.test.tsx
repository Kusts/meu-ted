import { render, screen } from "@/lib/test-utils";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

describe("smoke", () => {
  it("renders app shell", () => {
    render(<div data-testid="app">Pi Financeiro</div>);
    expect(screen.getByTestId("app")).toBeInTheDocument();
    expect(screen.getByText("Pi Financeiro")).toBeInTheDocument();
  });
});

describe("manifest", () => {
  it("exports name and short_name", async () => {
    const { default: manifest } = await import("@/app/manifest");
    const result = manifest();
    expect(result.name).toBe("Pi Financeiro");
    expect(result.short_name).toBe("Pi Financeiro");
  });

  it("sets display to standalone", async () => {
    const { default: manifest } = await import("@/app/manifest");
    const result = manifest();
    expect(result.display).toBe("standalone");
  });

  it("sets theme_color and background_color", async () => {
    const { default: manifest } = await import("@/app/manifest");
    const result = manifest();
    expect(result.theme_color).toBe("#0E8C5A");
    expect(result.background_color).toBe("#F7F8F5");
  });

  it("references at least two icon sizes", async () => {
    const { default: manifest } = await import("@/app/manifest");
    const result = manifest();
    expect(result.icons).toBeDefined();
    expect(result.icons!.length).toBeGreaterThanOrEqual(2);
  });

  it("sets start_url to root", async () => {
    const { default: manifest } = await import("@/app/manifest");
    const result = manifest();
    expect(result.start_url).toBe("/");
  });
});

describe("page render smoke", () => {
  it("renders HomePage without crashing", async () => {
    const { default: HomePage } = await import("@/features/home/HomePage");
    render(<HomePage />);
    expect(screen.getByText(/Saldo total/)).toBeInTheDocument();
  });

  it("renders RecordsPage without crashing", async () => {
    const { default: RecordsPage } = await import("@/features/records/RecordsPage");
    render(<RecordsPage />);
    expect(screen.getByText("Registros")).toBeInTheDocument();
  });

  it("renders PayablesPage without crashing", async () => {
    const { default: PayablesPage } = await import("@/features/payables/PayablesPage");
    render(<PayablesPage />);
    expect(screen.getByText("Contas a pagar")).toBeInTheDocument();
  });

  it("renders CardsPage without crashing", async () => {
    const { default: CardsPage } = await import("@/features/cards/CardsPage");
    render(<CardsPage />);
    expect(screen.getByText("Cartões")).toBeInTheDocument();
  });

  it("renders BudgetsPage without crashing", async () => {
    const { default: BudgetsPage } = await import("@/features/budgets/BudgetsPage");
    render(<BudgetsPage />);
    expect(screen.getByText("Orçamentos")).toBeInTheDocument();
  });

  it("renders GoalsPage without crashing", async () => {
    const { default: GoalsPage } = await import("@/features/goals/GoalsPage");
    render(<GoalsPage />);
    expect(screen.getByText("Metas & Dívidas")).toBeInTheDocument();
  });

  it("renders AccountsPage without crashing", async () => {
    const { default: AccountsPage } = await import("@/features/accounts/AccountsPage");
    render(<AccountsPage />);
    expect(screen.getByText("Contas")).toBeInTheDocument();
  });

  it("renders CategoriesPage without crashing", async () => {
    const { default: CategoriesPage } = await import("@/features/categories/CategoriesPage");
    render(<CategoriesPage />);
    expect(screen.getByText("Categorias")).toBeInTheDocument();
  });

  it("renders WalletPage without crashing", async () => {
    const { default: WalletPage } = await import("@/features/wallet/WalletPage");
    render(<WalletPage />);
    expect(screen.getByText("Patrimônio")).toBeInTheDocument();
  });
});
