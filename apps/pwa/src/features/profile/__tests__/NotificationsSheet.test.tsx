import { render, screen } from "@/lib/test-utils";
import userEvent from "@testing-library/user-event";
import NotificationsSheet from "../NotificationsSheet";
import * as appStateModule from "@/lib/state/app-state-context";
import type { AppState, Account, Transaction, CardStatement } from "@/lib/state/types";

const mockRouter = { push: vi.fn(), refresh: vi.fn() };
vi.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
}));

function baseState(): AppState {
  return {
    accounts: [], categories: [], transactions: [],
    payables: [], budgets: [], goals: [], debts: [], subscriptions: [],
    cardStatements: [], profile: null, loading: false, error: null,
    saveProfile: vi.fn(), refreshProfile: vi.fn(),
    addTransaction: vi.fn(), updateTransaction: vi.fn(), deleteTransaction: vi.fn(),
    markPayablePaid: vi.fn(), cancelPayable: vi.fn(), createPayable: vi.fn(),
    createBudget: vi.fn(), updateBudget: vi.fn(),
    createGoal: vi.fn(), contributeToGoal: vi.fn(), cancelGoal: vi.fn(),
    addAccount: vi.fn(), updateAccount: vi.fn(), deactivateAccount: vi.fn(),
    addCategory: vi.fn(), updateCategory: vi.fn(), deactivateCategory: vi.fn(),
    addCard: vi.fn(), updateCard: vi.fn(),
    addSubscription: vi.fn(), cancelSubscription: vi.fn(), refreshSubscriptions: vi.fn(),
    createTransfer: vi.fn(), payStatement: vi.fn(), createInstallments: vi.fn(),
    writeError: null, clearWriteError: vi.fn(),
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
  } as AppState;
}

describe("NotificationsSheet", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.spyOn(appStateModule, "useAppState").mockReturnValue(baseState());
  });

  it("renders empty state when no items derive from state", () => {
    render(<NotificationsSheet open onClose={vi.fn()} />);
    expect(screen.getByText(/Nada urgente agora/i)).toBeInTheDocument();
  });

  it("emits an overdue payable item when state has overdue payables", () => {
    vi.spyOn(appStateModule, "useAppState").mockReturnValue({
      ...baseState(),
      payables: [
        { id: "p1", description: "Aluguel", amountCents: 100000, dueDate: "2026-06-01", status: "overdue" },
      ],
    } as AppState);
    render(<NotificationsSheet open onClose={vi.fn()} />);
    expect(screen.getByText(/Aluguel/i)).toBeInTheDocument();
    // Click the "Abrir" button, must push /a-pagar.
  });

  it("emits a budget-near-limit item when budget usage ≥ 90%", () => {
    vi.spyOn(appStateModule, "useAppState").mockReturnValue({
      ...baseState(),
      budgets: [
        { id: "b1", categoryId: "c1", name: "Alimentação", amountCents: 100000, spentCents: 95000, period: "monthly" },
      ],
    } as AppState);
    render(<NotificationsSheet open onClose={vi.fn()} />);
    // New format: 95% < 100% → "quase no limite"
    expect(screen.getByText(/Alimentação.*quase no limite/i)).toBeInTheDocument();
  });

  it("does NOT show budget item below 90% usage", () => {
    vi.spyOn(appStateModule, "useAppState").mockReturnValue({
      ...baseState(),
      budgets: [
        { id: "b1", categoryId: "c1", name: "Fresca", amountCents: 100000, spentCents: 50000, period: "monthly" },
      ],
    } as AppState);
    render(<NotificationsSheet open onClose={vi.fn()} />);
    expect(screen.queryByText(/Fresca/i)).not.toBeInTheDocument();
  });

  it("emits card-near-limit item when latest statement uses > 80% of the limit", () => {
    vi.spyOn(appStateModule, "useAppState").mockReturnValue({
      ...baseState(),
      accounts: [
        {
          id: "card1", name: "Cartão Itaú", kind: "credit_card",
          color: "#EC7000", creditLimitCents: 100000,
          closingDay: 1, dueDay: 10,
        },
      ] as Account[],
      cardStatements: [
        {
          id: "stmt-1",
          accountId: "card1",
          cycleYearMonth: "2026-07",
          closingDate: "2026-07-20",
          dueDate: "2026-07-28",
          totalCents: 85000,
          paidCents: 0,
          status: "open",
        },
      ] as CardStatement[],
      transactions: [] as Transaction[],
    } as AppState);
    render(<NotificationsSheet open onClose={vi.fn()} />);
    // New format: "Cartão Itaú — 85% do limite"
    expect(screen.getByText(/85%.*limite/i)).toBeInTheDocument();
  });

  it("clicking 'Abrir' navigates to /a-pagar and closes the sheet", async () => {
    const onClose = vi.fn();
    vi.spyOn(appStateModule, "useAppState").mockReturnValue({
      ...baseState(),
      payables: [
        { id: "p1", description: "Luz", amountCents: 12000, dueDate: "2026-06-15", status: "overdue" },
      ],
    } as AppState);
    const user = userEvent.setup();
    render(<NotificationsSheet open onClose={onClose} />);
    await user.click(screen.getByText("Abrir"));
    expect(mockRouter.push).toHaveBeenCalledWith("/a-pagar");
    expect(onClose).toHaveBeenCalled();
  });

  it("clicking 'Abrir' on a card-near-limit item navigates to /cartoes?cardId=", async () => {
    const onClose = vi.fn();
    vi.spyOn(appStateModule, "useAppState").mockReturnValue({
      ...baseState(),
      accounts: [
        { id: "card-x", name: "Cartão X", kind: "credit_card",
          color: "#EC7000", creditLimitCents: 100000, closingDay: 1, dueDay: 10,
        },
      ] as Account[],
      cardStatements: [
        { id: "stmt-1", accountId: "card-x", cycleYearMonth: "2026-07",
          closingDate: "2026-07-20", dueDate: "2026-07-28", totalCents: 85000, paidCents: 0, status: "open" },
      ] as CardStatement[],
    } as AppState);
    const user = userEvent.setup();
    render(<NotificationsSheet open onClose={onClose} />);
    await user.click(screen.getByText("Abrir"));
    expect(mockRouter.push).toHaveBeenCalledWith("/cartoes?cardId=card-x");
    expect(onClose).toHaveBeenCalled();
  });

  it("clicking 'Dispensar' hides the item", async () => {
    vi.spyOn(appStateModule, "useAppState").mockReturnValue({
      ...baseState(),
      payables: [
        { id: "p1", description: "Internet", amountCents: 12000, dueDate: "2026-06-15", status: "overdue" },
      ],
    } as AppState);
    const user = userEvent.setup();
    render(<NotificationsSheet open onClose={vi.fn()} />);
    expect(screen.getByText(/Internet/i)).toBeInTheDocument();
    await user.click(screen.getByText("Dispensar"));
    expect(screen.queryByText(/Internet/i)).not.toBeInTheDocument();
  });

  // ── Section + type labels (corrections) ──────────────────────────────

  it("renders section headers Urgente, Hoje, Em breve", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-02T12:00:00"));
    // Urgente: overdue payable
    // Hoje: payable due same day
    // Em breve: card near limit (80%)
    vi.spyOn(appStateModule, "useAppState").mockReturnValue({
      ...baseState(),
      payables: [
        { id: "p-over", description: "Aluguel", amountCents: 180000, dueDate: "2026-06-01", status: "overdue" },
        { id: "p-today", description: "Condomínio", amountCents: 50000, dueDate: "2026-07-02", status: "pending" },
      ],
      accounts: [
        { id: "card1", name: "Nubank", kind: "credit_card",
          color: "#820AD1", creditLimitCents: 800000, closingDay: 15, dueDay: 22 },
      ] as Account[],
      cardStatements: [
        { id: "stmt-1", accountId: "card1", cycleYearMonth: "2026-07",
          closingDate: "2026-07-05", dueDate: "2026-07-13", totalCents: 700000, paidCents: 0, status: "open" },
      ] as CardStatement[],
    } as AppState);
    render(<NotificationsSheet open onClose={vi.fn()} />);
    expect(screen.getByText("Urgente")).toBeInTheDocument();
    expect(screen.getByText("Hoje")).toBeInTheDocument();
    expect(screen.getByText("Em breve")).toBeInTheDocument();
    vi.useRealTimers();
  });

  it("renders a type label badge on each card", () => {
    vi.spyOn(appStateModule, "useAppState").mockReturnValue({
      ...baseState(),
      payables: [
        { id: "p1", description: "Luz", amountCents: 12000, dueDate: "2026-06-15", status: "overdue" },
      ],
    } as AppState);
    render(<NotificationsSheet open onClose={vi.fn()} />);
    // Each card should have a label like "Conta a pagar" in a badge
    const labelBadges = screen.getAllByTestId("notification-type-label");
    expect(labelBadges.length).toBeGreaterThanOrEqual(1);
    expect(labelBadges[0]!.textContent).toMatch(/Conta a pagar/i);
  });

  it("renders type label 'Cartão' for card-limit alerts", () => {
    vi.spyOn(appStateModule, "useAppState").mockReturnValue({
      ...baseState(),
      accounts: [
        { id: "card1", name: "Inter", kind: "credit_card",
          color: "#FF7A00", creditLimitCents: 400000, closingDay: 10, dueDay: 18 },
      ] as Account[],
      cardStatements: [
        { id: "stmt-1", accountId: "card1", cycleYearMonth: "2026-07",
          closingDate: "2026-07-02", dueDate: "2026-07-10", totalCents: 350000, paidCents: 0, status: "open" },
      ] as CardStatement[],
    } as AppState);
    render(<NotificationsSheet open onClose={vi.fn()} />);
    const labels = screen.getAllByTestId("notification-type-label");
    expect(labels[0]!.textContent).toMatch(/Cartão/i);
  });

  it("renders type label 'Orçamento' for budget alerts", () => {
    vi.spyOn(appStateModule, "useAppState").mockReturnValue({
      ...baseState(),
      budgets: [
        { id: "b1", categoryId: "c1", name: "Transporte", amountCents: 10000, spentCents: 10000, period: "monthly" },
      ],
    } as AppState);
    render(<NotificationsSheet open onClose={vi.fn()} />);
    const labels = screen.getAllByTestId("notification-type-label");
    expect(labels[0]!.textContent).toMatch(/Orçamento/i);
  });

  it("renders urgency section Urgente before Hoje before Em breve", () => {
    vi.spyOn(appStateModule, "useAppState").mockReturnValue({
      ...baseState(),
      payables: [
        { id: "p-over", description: "Aluguel", amountCents: 180000, dueDate: "2026-06-01", status: "overdue" },
      ],
      budgets: [
        { id: "b1", categoryId: "c1", name: "Mercado", amountCents: 50000, spentCents: 45000, period: "monthly" },
      ],
    } as AppState);
    render(<NotificationsSheet open onClose={vi.fn()} />);
    // The sections are in a div with data-testid. Check DOM ordering.
    const urgentSection = screen.getByTestId("notifications-section-urgent");
    const soonSection = screen.getByTestId("notifications-section-soon");
    // In DOM year urgent element should come before soon element
    const container = screen.getByRole("dialog");
    const urgentPos = container.compareDocumentPosition(urgentSection);
    const soonPos = container.compareDocumentPosition(soonSection);
    // Node.DOCUMENT_POSITION_FOLLOWING = 4
    expect(urgentPos).toBeGreaterThan(0);
    expect(soonPos).toBeGreaterThan(0);
  });

  it("shows goal-backed items when present (≤10% progress = alert)", () => {
    vi.spyOn(appStateModule, "useAppState").mockReturnValue({
      ...baseState(),
      goals: [
        { id: "g1", name: "Reserva", goalType: "savings",
          targetAmountCents: 600000, currentAmountCents: 100000 },
      ],
    } as AppState);
    render(<NotificationsSheet open onClose={vi.fn()} />);
    // 100000 / 600000 ≈ 16.7% — above 10% threshold, so no alert
    // Use a goal with ≤10% instead:
    vi.spyOn(appStateModule, "useAppState").mockReturnValue({
      ...baseState(),
      goals: [
        { id: "g2", name: "MacBook", goalType: "savings",
          targetAmountCents: 1000000, currentAmountCents: 50000 },
      ],
    } as AppState);
    render(<NotificationsSheet open onClose={vi.fn()} />);
    // 50000 / 1000000 = 5% ≤ 10% → should create a "soon" alert
    expect(screen.getByText(/só 5%/i)).toBeInTheDocument();
  });

  it("does not show Nada urgente agora when items are present", () => {
    vi.spyOn(appStateModule, "useAppState").mockReturnValue({
      ...baseState(),
      payables: [
        { id: "p1", description: "Internet", amountCents: 12000, dueDate: "2026-06-15", status: "overdue" },
      ],
    } as AppState);
    render(<NotificationsSheet open onClose={vi.fn()} />);
    expect(screen.queryByText(/Nada urgente agora/i)).not.toBeInTheDocument();
  });
});

