import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@/lib/test-utils";
import AccountsPage from "../AccountsPage";
import * as appStateModule from "@/lib/state/app-state-context";
const mockAccounts = [
  { id: "acc-nubank", name: "Nubank", balanceCents: 100000, kind: "checking" as const, color: "#820AD1" },
  { id: "acc-inter", name: "Inter", balanceCents: 50000, kind: "checking" as const, color: "#FF7A00" },
  { id: "acc-itau", name: "Itaú Personnalité", balanceCents: 200000, kind: "checking" as const, color: "#1A1A1A" },
  { id: "acc-bb", name: "Banco do Brasil", balanceCents: 300000, kind: "checking" as const, color: "#003DA5" },
  { id: "acc-caixa", name: "Caixa Econômica", balanceCents: 400000, kind: "savings" as const, color: "#005CA9" },
];

describe("Banco presets nas contas (TDD)", () => {
  it("aplica identidade visual do banco nas contas (gradiente/borda/cor)", () => {
    vi.spyOn(appStateModule, "useAppState").mockReturnValue({
      accounts: mockAccounts as never,
      transactions: [],
      categories: [],
      payables: [],
      budgets: [],
      goals: [],
      debts: [],
      subscriptions: [],
      cardStatements: [],
      loading: false,
      error: null,
      writeError: null,
      clearWriteError: vi.fn(),
      sync: {
        accounts: { source: "mock", syncedAt: null },
        transactions: { source: "mock", syncedAt: null },
        categories: { source: "mock", syncedAt: null },
        payables: { source: "mock", syncedAt: null },
        budgets: { source: "mock", syncedAt: null },
        goals: { source: "mock", syncedAt: null },
        subscriptions: { source: "mock", syncedAt: null },
        cardStatements: { source: "mock", syncedAt: null },
      } as never,
      readOnly: false,
      addAccount: vi.fn(),
      updateAccount: vi.fn(),
      deactivateAccount: vi.fn(),
      addCard: vi.fn(),
      updateCard: vi.fn(),
      addCategory: vi.fn(),
      addTransaction: vi.fn(),
      deleteTransaction: vi.fn(),
      createPayable: vi.fn(),
      markPayablePaid: vi.fn(),
      cancelPayable: vi.fn(),
      createBudget: vi.fn(),
      updateBudget: vi.fn(),
      createGoal: vi.fn(),
      contributeToGoal: vi.fn(),
      cancelGoal: vi.fn(),
      addSubscription: vi.fn(),
      cancelSubscription: vi.fn(),
      createTransfer: vi.fn(),
      payStatement: vi.fn(),
      createInstallments: vi.fn(),
    } as never);
    render(<AccountsPage />);
    // Cada conta deve renderizar com identidade visual distinta (não todas iguais)
    const cards = screen.getAllByTestId("account-card");
    expect(cards.length).toBeGreaterThanOrEqual(5);
    const styles = cards.map((c) => c.getAttribute("style") || c.className);
    const presets = cards.map((c) => c.getAttribute("data-bank"));
    // Devem ter estilos distintos via preset (gradiente ou cor)
    expect(new Set(styles).size).toBeGreaterThan(1);
    expect(new Set(presets).size).toBeGreaterThan(1);
  });

  it("resolve banco por nome mesmo quando color não bate (fallback por nome)", () => {
    const accWithWrongColor = { id: "acc-xp", name: "XP Investimentos", balanceCents: 900000, kind: "investment" as const, color: "#123456" } as never;
    vi.spyOn(appStateModule, "useAppState").mockReturnValue({
      accounts: [accWithWrongColor],
      transactions: [],
      categories: [],
      payables: [],
      budgets: [],
      goals: [],
      debts: [],
      subscriptions: [],
      cardStatements: [],
      loading: false,
      error: null,
      writeError: null,
      clearWriteError: vi.fn(),
      sync: {
        accounts: { source: "mock", syncedAt: null },
        transactions: { source: "mock", syncedAt: null },
        categories: { source: "mock", syncedAt: null },
        payables: { source: "mock", syncedAt: null },
        budgets: { source: "mock", syncedAt: null },
        goals: { source: "mock", syncedAt: null },
        subscriptions: { source: "mock", syncedAt: null },
        cardStatements: { source: "mock", syncedAt: null },
      } as never,
      readOnly: false,
      addAccount: vi.fn(),
      updateAccount: vi.fn(),
      deactivateAccount: vi.fn(),
      addCard: vi.fn(),
      updateCard: vi.fn(),
      addCategory: vi.fn(),
      addTransaction: vi.fn(),
      deleteTransaction: vi.fn(),
      createPayable: vi.fn(),
      markPayablePaid: vi.fn(),
      cancelPayable: vi.fn(),
      createBudget: vi.fn(),
      updateBudget: vi.fn(),
      createGoal: vi.fn(),
      contributeToGoal: vi.fn(),
      cancelGoal: vi.fn(),
      addSubscription: vi.fn(),
      cancelSubscription: vi.fn(),
      createTransfer: vi.fn(),
      payStatement: vi.fn(),
      createInstallments: vi.fn(),
    } as never);
    render(<AccountsPage />);
    // Deve ainda renderizar a conta com identidade XP (não genérica)
    expect(screen.getAllByText("XP Investimentos").length).toBeGreaterThanOrEqual(1);
    const card = screen.getByTestId("account-card");
    // Deve ter algum estilo que não seja o fallback genérico cinza
    expect(card.getAttribute("style") || card.className).not.toMatch(/#4A5568/);
  });
});
