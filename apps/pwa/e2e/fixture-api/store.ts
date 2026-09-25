/**
 * Scoped test stores for E2E fixture API.
 * Each testId gets independent state, journal, and scenario rules.
 * Fixed clock: 2026-07-17T12:00:00.000Z (America/Sao_Paulo, pt-BR)
 */

export interface JournalEntry {
  method: string;
  path: string;
  body: unknown;
  status: number;
}

export interface SeedData {
  token: string;
  deviceId: string;
  householdId: string;
  accounts: Array<{
    id: string;
    name: string;
    kind: "bank" | "cash" | "credit_card";
    initialBalanceCents: number;
    balanceCents?: number;
    creditLimitCents?: number;
    closingDay?: number;
    dueDay?: number;
  }>;
  categories: Array<{
    id: string;
    name: string;
    kind: "expense" | "income";
    parentId?: string;
  }>;
  transactions: Array<{
    id: string;
    description: string;
    amountCents: number;
    date: string;
    categoryId: string;
    accountId: string;
    kind: "expense" | "income";
  }>;
  payables: Array<{
    id: string;
    description: string;
    amountCents: number;
    dueDate: string;
    status: "pending" | "paid" | "overdue" | "cancelled";
    accountId: string;
    paidDate?: string;
  }>;
  budgets: Array<{
    id: string;
    name: string;
    amountCents: number;
    categoryId: string;
    period: "monthly" | "quarterly" | "yearly";
    startDate: string;
    spentCents: number;
  }>;
  goals: Array<{
    id: string;
    name: string;
    goalType: "savings" | "purchase" | "debt_payoff" | "emergency_fund";
    targetAmountCents: number;
    currentAmountCents: number;
    startDate: string;
    status: "active" | "achieved" | "failed" | "cancelled";
  }>;
  cardAccounts: Array<{
    id: string;
    name: string;
    creditLimitCents: number;
    closingDay: number;
    dueDay: number;
    currentSpendCents: number;
  }>;
  cardStatements: Array<{
    id: string;
    accountId: string;
    closingDate: string;
    dueDate: string;
    totalCents: number;
    paidCents: number;
    status: "open" | "closed" | "paid" | "overdue" | "partial";
    purchases: Array<{
      id: string;
      description: string;
      amountCents: number;
      date: string;
      categoryId: string;
      installments?: { total: number; current: number };
    }>;
  }>;
  subscriptions: Array<{
    id: string;
    name: string;
    amountCents: number;
    cycle: "monthly" | "yearly" | "weekly";
    day: number;
    paymentMethod: string;
    status: "active" | "cancelled";
  }>;
  profile: {
    name: string;
    email: string;
    avatarColor: string;
    greetingStyle: string;
  } | null;
  quickInsights: Array<{
    label: string;
    valueCents: number;
    type: "expense" | "income" | "balance";
  }>;
  transfers: Array<{
    id: string;
    description: string;
    amountCents: number;
    date: string;
    fromAccountId: string;
    toAccountId: string;
  }>;
  authRegister: {
    token: string;
    deviceId: string;
    householdId: string;
  } | null;
}

export interface ScenarioRule {
  method: string;
  pathname: string;
  search?: string;
  delayMs?: number;
  status?: number;
  offline?: boolean;
  once?: boolean;
  used?: boolean;
}

export interface TestStore {
  seed: SeedData;
  journal: JournalEntry[];
  scenarios: ScenarioRule[];
  nextId: number;
  /**
   * Better Auth-modeled cookie session, testId-scoped: each sign-in mints a
   * distinct unpredictable token (POST /auth/sign-in/email), and only that
   * token authenticates this testId's session until POST /auth/sign-out
   * revokes it (null = no active session). A presented cookie is compared
   * against this token — never against a shared static value.
   */
  sessionToken: string | null;
}

const FIXED_CLOCK = new Date("2026-07-17T12:00:00.000Z");

export function getFixedClock(): Date {
  return new Date(FIXED_CLOCK);
}

export function generateId(): string {
  return Math.random().toString(36).substring(2, 10);
}

export class StoreManager {
  private stores = new Map<string, TestStore>();

  reset(testId: string, seed: keyof typeof SEEDS = "populated"): TestStore {
    const data = structuredClone(SEEDS[seed] ?? SEEDS.empty);
    const store: TestStore = {
      seed: data,
      journal: [],
      scenarios: [],
      nextId: 1000,
      sessionToken: null,
    };
    this.stores.set(testId, store);
    return store;
  }

  get(testId: string): TestStore | undefined {
    return this.stores.get(testId);
  }

  getOrCreate(testId: string): TestStore {
    let store = this.stores.get(testId);
    if (!store) {
      store = this.reset(testId, "empty");
    }
    return store;
  }

  delete(testId: string): void {
    this.stores.delete(testId);
  }

  clear(): void {
    this.stores.clear();
  }

  getTestIds(): string[] {
    return Array.from(this.stores.keys());
  }
}

// ─── Seeds ───────────────────────────────────────────────────────────────────

export const SEEDS: Record<string, SeedData> = {
  populated: {
    token: "e2e-test-token-abc123",
    deviceId: "e2e-device-001",
    householdId: "e2e-household-001",
    accounts: [
      { id: "acc-1", name: "Conta Corrente", kind: "bank", initialBalanceCents: 500000, balanceCents: 500000 },
      { id: "acc-2", name: "Dinheiro", kind: "cash", initialBalanceCents: 20000, balanceCents: 20000 },
    ],
    categories: [
      { id: "cat-1", name: "Alimentação", kind: "expense" },
      { id: "cat-2", name: "Transporte", kind: "expense" },
      { id: "cat-3", name: "Salário", kind: "income" },
      { id: "cat-4", name: "Sub-alimentação", kind: "expense", parentId: "cat-1" },
    ],
    transactions: [
      { id: "tx-1", description: "Supermercado", amountCents: 15000, date: "2026-07-10", categoryId: "cat-1", accountId: "acc-1", kind: "expense" },
      { id: "tx-2", description: "Uber", amountCents: 2500, date: "2026-07-11", categoryId: "cat-2", accountId: "acc-1", kind: "expense" },
    ],
    payables: [
      { id: "pay-1", description: "Conta de Luz", amountCents: 12000, dueDate: "2026-07-20", status: "pending", accountId: "acc-1" },
      { id: "pay-2", description: "Internet", amountCents: 8900, dueDate: "2026-07-15", status: "pending", accountId: "acc-1" },
    ],
    budgets: [
      { id: "bud-1", name: "Alimentação Mensal", amountCents: 80000, categoryId: "cat-1", period: "monthly", startDate: "2026-07-01", spentCents: 15000 },
    ],
    goals: [
      { id: "goal-1", name: "Reserva de Emergência", goalType: "emergency_fund", targetAmountCents: 1000000, currentAmountCents: 200000, startDate: "2026-01-01", status: "active" },
    ],
    cardAccounts: [
      { id: "card-1", name: "Nubank", creditLimitCents: 500000, closingDay: 15, dueDay: 22, currentSpendCents: 120000 },
    ],
    cardStatements: [
      {
        id: "stmt-1", accountId: "card-1", closingDate: "2026-07-15", dueDate: "2026-07-22",
        totalCents: 120000, paidCents: 0, status: "open",
        purchases: [
          { id: "pur-1", description: "Amazon", amountCents: 45000, date: "2026-07-05", categoryId: "cat-1" },
          { id: "pur-2", description: "iFood", amountCents: 35000, date: "2026-07-08", categoryId: "cat-1" },
        ],
      },
    ],
    subscriptions: [
      { id: "sub-1", name: "Netflix", amountCents: 5590, cycle: "monthly", day: 10, paymentMethod: "credit_card", status: "active" },
    ],
    profile: {
      name: "Usuário Teste",
      email: "teste@example.com",
      avatarColor: "#3B82F6",
      greetingStyle: "formal",
    },
    quickInsights: [
      { label: "Gastos do mês", valueCents: 17500, type: "expense" },
      { label: "Receitas do mês", valueCents: 500000, type: "income" },
    ],
    transfers: [
      { id: "trf-1", description: "Poupança", amountCents: 50000, date: "2026-07-01", fromAccountId: "acc-1", toAccountId: "acc-2" },
    ],
    authRegister: {
      token: "e2e-test-token-abc123",
      deviceId: "e2e-device-001",
      householdId: "e2e-household-001",
    },
  },

  empty: {
    token: "",
    deviceId: "",
    householdId: "",
    accounts: [],
    categories: [],
    transactions: [],
    payables: [],
    budgets: [],
    goals: [],
    cardAccounts: [],
    cardStatements: [],
    subscriptions: [],
    profile: null,
    quickInsights: [],
    transfers: [],
    authRegister: null,
  },
};
