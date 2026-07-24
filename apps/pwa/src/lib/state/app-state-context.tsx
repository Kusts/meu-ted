"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  useMemo,
  type ReactNode,
} from "react";
import type {
  Transaction,
  Account,
  Category,
  Payable,
  Budget,
  Goal,
  Debt,
  Subscription,
  CardStatement,
  Profile,
  QuickInsight,
} from "./types";
import {
  ALL_MOCK_TRANSACTIONS,
  mockAccounts,
  mockCategories,
  mockPayables,
  mockBudgets,
  mockGoals,
  mockDebts,
  mockSubscriptions,
} from "./mock-data";
import { isApiConfigured, getAuthToken } from "@/lib/api/client";
import { type DomainKey } from "./snapshot-store";
import { useSession } from "@/lib/auth/session-context";
import { ApiError } from "@/lib/api/client";
import * as endpoints from "@/lib/api/endpoints";
import { runBootstrap, type SnapshotPreload } from "./sync-engine";
import type { AppStateAction } from "./state-reducer";
import { migrateV1toV2, loadSnapshotDomain } from "./snapshot-store";
import { createCommands, type Commands } from "./commands";
import { useUnsavedChangesSafe } from "@/lib/unsaved-changes";
import { createProfileAdapter } from "./profile-adapter";
import { createSubscriptionsAdapter } from "./subscriptions-adapter";

export interface AppState {
  // Data
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  payables: Payable[];
  budgets: Budget[];
  goals: Goal[];
  debts: Debt[];
  subscriptions: Subscription[];
  cardStatements: CardStatement[];
  profile: Profile | null;
  quickInsights?: QuickInsight[];
  saveProfile: (input: {
    name?: string;
    email?: string;
    phone?: string;
    avatarColor?: string;
    greetingStyle?: Profile["greetingStyle"];
  }) => Promise<void>;
  refreshProfile: () => Promise<void>;
  // Sync / mode
  sync: Record<DomainKey, DomainSync>;
  readOnly: boolean;
  // Fetch state
  loading: boolean;
  error: string | null;
  writeError: string | null;
  clearWriteError: () => void;
  // Write actions
  addTransaction: (tx: Transaction) => Promise<void>;
  updateTransaction: (
    id: string,
    input: {
      description?: string;
      date?: string;
      amountCents?: number;
      accountId?: string;
      categoryId?: string;
    },
  ) => Promise<void>;
  deleteTransaction: (id: string) => Promise<void>;
  markPayablePaid: (id: string) => Promise<void>;
  cancelPayable: (id: string) => Promise<void>;
  updatePayable: (id: string, input: {
    description?: string;
    amountCents?: number;
    dueDate?: string;
    accountId?: string;
    categoryId?: string;
  }) => Promise<void>;
  undoPayablePayment: (id: string) => Promise<void>;
  createPayable: (input: {
    accountId: string;
    description: string;
    amountCents: number;
    dueDate: string;
    categoryId?: string;
  }) => Promise<void>;
  createBudget: (input: {
    categoryId: string;
    name: string;
    amountCents: number;
    period: "monthly" | "quarterly" | "yearly";
    startDate: string;
  }) => Promise<void>;
  updateBudget: (
    id: string,
    input: { amountCents?: number; alertThreshold?: number },
  ) => Promise<void>;
  createGoal: (input: {
    name: string;
    goalType: "savings" | "purchase" | "debt_payoff" | "emergency_fund";
    targetAmountCents: number;
    startDate: string;
  }) => Promise<void>;
  contributeToGoal: (
    id: string,
    input: { amountCents: number },
  ) => Promise<void>;
  cancelGoal: (id: string) => Promise<void>;
  updateGoal: (id: string, input: {
    name?: string;
    targetAmountCents?: number;
    targetDate?: string;
  }) => Promise<void>;
  addAccount: (input: {
    name: string;
    kind: "bank" | "cash" | "credit_card";
    initialBalanceCents: number;
  }) => Promise<void>;
  updateAccount: (id: string, input: { name: string }) => Promise<void>;
  deactivateAccount: (id: string) => Promise<void>;
  addCategory: (input: {
    name: string;
    kind: "expense" | "income";
    parentId?: string;
  }) => Promise<void>;
  updateCategory: (id: string, input: { name: string }) => Promise<void>;
  deactivateCategory: (id: string) => Promise<void>;
  addCard: (input: {
    name: string;
    creditLimitCents: number;
    closingDay: number;
    dueDay: number;
  }) => Promise<void>;
  updateCard: (
    id: string,
    input: {
      name?: string;
      creditLimitCents?: number;
      closingDay?: number;
      dueDay?: number;
    },
  ) => Promise<void>;
  addSubscription: (input: {
    name: string;
    amountCents: number;
    cycle: "monthly" | "yearly" | "weekly";
    day: number;
    paymentMethod: string;
  }) => Promise<void>;
  cancelSubscription: (id: string) => Promise<void>;
  updateSubscription: (id: string, input: {
    name?: string;
    amountCents?: number;
    cycle?: "monthly" | "yearly" | "weekly";
    day?: number;
    paymentMethod?: string;
  }) => Promise<void>;
  /** Lazy-load subscriptions on demand — not fetched during bootstrap */
  refreshSubscriptions: () => Promise<void>;
  createTransfer: (input: {
    description: string;
    amountCents: number;
    date: string;
    fromAccountId: string;
    toAccountId: string;
  }) => Promise<void>;
  payStatement: (
    statementId: string,
    input: { amountCents: number; fromAccountId: string },
  ) => Promise<void>;
  createInstallments: (input: {
    accountId: string;
    description: string;
    totalAmountCents: number;
    purchaseDate: string;
    installmentsTotal: number;
    categoryId?: string;
  }) => Promise<void>;
}

const AppStateContext = createContext<AppState | null>(null);

// ── Sync / read-only types & constants ────────────────────────────

export type DataSource = "live" | "snapshot" | "unavailable" | "mock";
export interface DomainSync { source: DataSource; syncedAt: string | null }

const ESSENTIAL_DOMAINS: DomainKey[] = [
  "accounts", "categories", "transactions", "payables", "budgets", "goals",
];

const ALL_DOMAINS: DomainKey[] = [
  ...ESSENTIAL_DOMAINS, "subscriptions", "cardStatements",
];

const STALE_SOURCES: DataSource[] = ["snapshot", "unavailable"];

function initialSync(source: DataSource): Record<DomainKey, DomainSync> {
  return Object.fromEntries(
    ALL_DOMAINS.map((d) => [d, { source, syncedAt: null }]),
  ) as Record<DomainKey, DomainSync>;
}

/** True when API base URL is configured AND an auth token exists */
function apiUsable(): boolean {
  return isApiConfigured() && getAuthToken() !== undefined;
}

export function AppStateProvider({ children }: { children: ReactNode }) {
  const configured = isApiConfigured();
  // ── State — empty when API configured, mock only when not ─────────
  const [accounts, setAccounts] = useState<Account[]>(configured ? [] : mockAccounts);
  const [categories, setCategories] = useState<Category[]>(configured ? [] : mockCategories);
  const [transactions, setTransactions] =
    useState<Transaction[]>(configured ? [] : ALL_MOCK_TRANSACTIONS);
  const [payables, setPayables] = useState<Payable[]>(configured ? [] : mockPayables);
  const [budgets, setBudgets] = useState<Budget[]>(configured ? [] : mockBudgets);
  const [goals, setGoals] = useState<Goal[]>(configured ? [] : mockGoals);
  const [debts] = useState<Debt[]>(configured ? [] : mockDebts);
  const [subscriptions, setSubscriptions] =
    useState<Subscription[]>(configured ? [] : mockSubscriptions);
  const [cardStatements, setCardStatements] = useState<CardStatement[]>([]);
  const [quickInsights, setQuickInsights] = useState<QuickInsight[]>([]);
  // Profile starts as null; defaults are derived via `effectiveProfile`.
  // We don't bake a "Marina" mock into the state because the spec wants
  // the home/avatar to reflect the persisted profile (real data, not
  // baked fixture).
  const [profile, setProfile] = useState<Profile | null>(null);
  const [sync, setSync] = useState<Record<DomainKey, DomainSync>>(() =>
    initialSync(configured ? "live" : "mock"),
  );
  const setSyncFor = useCallback((domain: DomainKey, s: DomainSync) => {
    setSync((prev) => ({ ...prev, [domain]: s }));
  }, []);
  const readOnly = useMemo(
    () => ESSENTIAL_DOMAINS.some((d) => STALE_SOURCES.includes(sync[d].source)),
    [sync],
  );
  const readOnlyRef = useRef(readOnly);
  const { expireSession } = useSession();
  const [loading, setLoading] = useState(apiUsable());
  const [error, setError] = useState<string | null>(null);
  const [writeError, setWriteError] = useState<string | null>(null);
  const clearWriteError = useCallback(() => setWriteError(null), []);

  const handleWriteError = useCallback(
    (e: unknown) => {
      if (e instanceof ApiError && e.status === 401) {
        expireSession();
        return;
      }
      if (e instanceof Error) setWriteError(e.message);
    },
    [expireSession],
  );
  const handleWriteErrorRef = useRef(handleWriteError);

  const guardReadOnly = useCallback((): boolean => {
    if (readOnlyRef.current) {
      setWriteError("Backend indisponível — modo somente leitura.");
      return true;
    }
    return false;
  }, []);
  const guardReadOnlyRef = useRef(guardReadOnly);

  // Refs to keep latest state accessible in callbacks without stale closures
  const payablesRef = useRef(payables);
  const accountsRef = useRef(accounts);
  const subsRef = useRef(subscriptions);
  const txsRef = useRef(transactions);
  const categoriesRef = useRef(categories);
  const budgetsRef = useRef(budgets);
  const goalsRef = useRef(goals);
  const stmtsRef = useRef(cardStatements);

  const loadedRef = useRef(false);

  // Sync refs with latest state (avoids react-hooks/refs lint)
  useEffect(() => {
    readOnlyRef.current = readOnly;
    handleWriteErrorRef.current = handleWriteError;
    guardReadOnlyRef.current = guardReadOnly;
    payablesRef.current = payables;
    accountsRef.current = accounts;
    subsRef.current = subscriptions;
    txsRef.current = transactions;
    categoriesRef.current = categories;
    budgetsRef.current = budgets;
    goalsRef.current = goals;
    stmtsRef.current = cardStatements;
  });

  // ── Bootstrap dispatch: maps reducer actions to provider state ───────
  // This replaces the former applyListDomain + inline fetch.
  const bootstrapDispatch = useCallback((action: AppStateAction) => {
    switch (action.type) {
      case "BOOTSTRAP_START":
        setLoading(true);
        setError(null);
        break;
      case "BOOTSTRAP_COMPLETE":
        setLoading(false);
        break;
      case "BOOTSTRAP_401":
        setLoading(false);
        break;
      case "DOMAIN_LIVE": {
        setSyncFor(action.domain, {
          source: "live",
          syncedAt: action.syncedAt,
        });
        switch (action.domain) {
          case "accounts": setAccounts(action.data as Account[]); break;
          case "categories": setCategories(action.data as Category[]); break;
          case "transactions": setTransactions(action.data as Transaction[]); break;
          case "payables": setPayables(action.data as Payable[]); break;
          case "budgets": setBudgets(action.data as Budget[]); break;
          case "goals": setGoals(action.data as Goal[]); break;
          case "cardStatements": setCardStatements(action.data as CardStatement[]); break;
        }
        break;
      }
      case "DOMAIN_SNAPSHOT":
        setSyncFor(action.domain, {
          source: "snapshot",
          syncedAt: action.syncedAt,
        });
        switch (action.domain) {
          case "accounts": setAccounts(action.data as Account[]); break;
          case "categories": setCategories(action.data as Category[]); break;
          case "transactions": setTransactions(action.data as Transaction[]); break;
          case "payables": setPayables(action.data as Payable[]); break;
          case "budgets": setBudgets(action.data as Budget[]); break;
          case "goals": setGoals(action.data as Goal[]); break;
          case "cardStatements": setCardStatements(action.data as CardStatement[]); break;
        }
        break;
      case "DOMAIN_UNAVAILABLE":
        setSyncFor(action.domain, { source: "unavailable", syncedAt: null });
        switch (action.domain) {
          case "accounts": setAccounts([]); break;
          case "categories": setCategories([]); break;
          case "transactions": setTransactions([]); break;
          case "payables": setPayables([]); break;
          case "budgets": setBudgets([]); break;
          case "goals": setGoals([]); break;
          case "cardStatements": setCardStatements([]); break;
        }
        break;
      case "SET_ERROR":
        setError(action.error);
        break;
    }
  }, [setSyncFor]);

  // Preload v2 snapshot data for all domains before bootstrap.
  const preloadSnapshot = useCallback(async (token: string): Promise<SnapshotPreload> => {
    const domains: DomainKey[] = ["accounts","categories","transactions","payables","budgets","goals","cardStatements"];
    const entries = await Promise.all(
      domains.map((d) => loadSnapshotDomain(token, d).then((v) => [d, v] as const)),
    );
    const preload: SnapshotPreload = {};
    for (const [domain, value] of entries) {
      if (value) preload[domain] = { data: value.data, syncedAt: value.syncedAt };
    }
    return preload;
  }, []);

  // ── Write boundary: commands factory (offline-safe) ───────────────
  // Every UI write goes through `commands.x(...)`; when `online` is false
  // the command throws `OfflineWriteError` with zero network/optimistic
  // side-effects. Stored in a ref so write callbacks (which keep `[]`
  // deps to stay referentially stable) always read the latest commands
  // at call time.
  const { trackWrite } = useUnsavedChangesSafe();
  const commandsRef = useRef<Commands | null>(null);
  useEffect(() => {
    commandsRef.current = createCommands({
      online: apiUsable(),
      token: getAuthToken() ?? undefined,
      dispatch: bootstrapDispatch,
      api: endpoints,
      trackWrite,
    });
  }, [bootstrapDispatch, trackWrite]);

  // ── Fetch from API when configured + token exists ─────────────────
  useEffect(() => {
    if (!apiUsable() || loadedRef.current) return;
    loadedRef.current = true;

    let cancelled = false;

    const load = async () => {
      const token = getAuthToken();
      if (!token) return;

      // 1. Migrate v1 → v2 (reads v1 localStorage, writes v2 IndexedDB, deletes v1)
      await migrateV1toV2(token);

      // 2. Preload existing v2 snapshot for offline fallback
      const snapshotPreload = await preloadSnapshot(token);

      // 3. Run bootstrap with preloaded snapshot data
      await runBootstrap(token, bootstrapDispatch, expireSession, snapshotPreload);

      if (cancelled) return;

      // Profile and insights are fetched inside runBootstrap but
      // handled separately by the provider (not in reducer).
      // Refresh them after bootstrap completes.
      try {
        const profileResult = await endpoints.fetchProfile();
        setProfile(profileResult);
      } catch {
        // profile failure is non-fatal
      }
      try {
        const insights = await endpoints.fetchQuickInsights();
        setQuickInsights(insights);
      } catch {
        setQuickInsights([]);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bootstrapDispatch, expireSession]);

  // ── Write actions ─────────────────────────────────────────────────

  const addTransaction = useCallback(async (tx: Transaction) => {
    if (guardReadOnlyRef.current()) return;
    setTransactions((prev) => [tx, ...prev]);

    if (!apiUsable()) return;

    try {
      if (tx.kind === "expense") {
        const created = await commandsRef.current!.createExpenseTransaction({
          description: tx.description,
          amountCents: tx.amountCents,
          date: tx.date,
          categoryId: tx.categoryId,
          accountId: tx.accountId,
        });
        setTransactions((prev) =>
          prev.map((t) => (t.id === tx.id ? { ...t, id: created.id } : t)),
        );
      } else if (tx.kind === "transfer") {
        throw new Error(
          "Use createTransfer mutator for transfers, not addTransaction",
        );
      } else {
        const created = await commandsRef.current!.createIncomeTransaction({
          description: tx.description,
          amountCents: tx.amountCents,
          date: tx.date,
          categoryId: tx.categoryId,
          accountId: tx.accountId,
        });
        setTransactions((prev) =>
          prev.map((t) => (t.id === tx.id ? { ...t, id: created.id } : t)),
        );
      }
    } catch (e) {
      setTransactions((prev) => prev.filter((t) => t.id !== tx.id));
      handleWriteErrorRef.current(e);
    }
  }, []);

  const updateTransaction = useCallback(
    async (
      id: string,
      input: {
        description?: string;
        date?: string;
        amountCents?: number;
        accountId?: string;
        categoryId?: string;
      },
    ) => {
      if (guardReadOnlyRef.current()) return;
      const prev = txsRef.current.find((t) => t.id === id);
      if (!prev) return;

      // Optimistic update — only mutate specified fields
      setTransactions((curr) =>
        curr.map((t) =>
          t.id === id
            ? {
                ...t,
                ...(input.description !== undefined
                  ? { description: input.description }
                  : {}),
                ...(input.date !== undefined ? { date: input.date } : {}),
                ...(input.amountCents !== undefined
                  ? { amountCents: input.amountCents }
                  : {}),
                ...(input.accountId !== undefined
                  ? { accountId: input.accountId }
                  : {}),
                ...(input.categoryId !== undefined
                  ? { categoryId: input.categoryId }
                  : {}),
              }
            : t,
        ),
      );

      if (!apiUsable()) return;

      try {
        await commandsRef.current!.updateTransaction(id, input);
      } catch (e) {
        // Rollback to previous state
        setTransactions((curr) =>
          curr.map((t) => (t.id === id ? prev : t)),
        );
        handleWriteErrorRef.current(e);
      }
    },
    [],
  );

  const deleteTransaction = useCallback(async (id: string) => {
    if (guardReadOnlyRef.current()) return;
    const prev = txsRef.current.find((t) => t.id === id);
    setTransactions((prev) => prev.filter((t) => t.id !== id));

    if (!apiUsable() || !prev) return;

    try {
      await commandsRef.current!.deleteTransaction(id);
    } catch (e) {
      if (prev) setTransactions((curr) => [prev, ...curr]);
      handleWriteErrorRef.current(e);
    }
  }, []);

  const markPayablePaid = useCallback(async (id: string) => {
    if (guardReadOnlyRef.current()) return;
    const prev = payablesRef.current.find((p) => p.id === id);
    const today = new Date().toISOString().slice(0, 10);

    setPayables((curr) =>
      curr.map((p) =>
        p.id === id ? { ...p, status: "paid" as const, paidDate: today } : p,
      ),
    );

    if (!apiUsable() || !prev) return;

    try {
      await commandsRef.current!.markPayablePaid(id, today);
    } catch (e) {
      setPayables((curr) =>
        curr.map((p) => (p.id === id ? prev : p)),
      );
      handleWriteErrorRef.current(e);
    }
  }, []);

  // ── Account update / deactivate ────────────────────────────

  const updateAccount = useCallback(
    async (id: string, input: { name: string }) => {
      if (guardReadOnlyRef.current()) return;
      const prev = accountsRef.current.find((a) => a.id === id);
      if (!prev) return;

      // Optimistic update
      setAccounts((curr) =>
        curr.map((a) => (a.id === id ? { ...a, name: input.name } : a)),
      );

      if (!apiUsable()) return;

      try {
        await commandsRef.current!.updateAccount(id, input);
      } catch (e) {
        setAccounts((curr) =>
          curr.map((a) => (a.id === id ? prev : a)),
        );
        handleWriteErrorRef.current(e);
      }
    },
    [],
  );

  const deactivateAccount = useCallback(async (id: string) => {
    if (guardReadOnlyRef.current()) return;
    const prev = accountsRef.current.find((a) => a.id === id);
    if (!prev) return;

    // Optimistic: remove from list
    setAccounts((curr) => curr.filter((a) => a.id !== id));

    if (!apiUsable()) return;

    try {
      await commandsRef.current!.deactivateAccount(id);
    } catch (e) {
      setAccounts((curr) => [prev, ...curr]);
      handleWriteErrorRef.current(e);
    }
  }, []);

  // ── Category update / deactivate ───────────────────────────

  const updateCategory = useCallback(
    async (id: string, input: { name: string }) => {
      if (guardReadOnlyRef.current()) return;
      const prev = categoriesRef.current.find((c) => c.id === id);
      if (!prev) return;

      setCategories((curr) =>
        curr.map((c) => (c.id === id ? { ...c, name: input.name } : c)),
      );

      if (!apiUsable()) return;

      try {
        await commandsRef.current!.updateCategory(id, input);
      } catch (e) {
        setCategories((curr) =>
          curr.map((c) => (c.id === id ? prev : c)),
        );
        handleWriteErrorRef.current(e);
      }
    },
    [],
  );

  const deactivateCategory = useCallback(async (id: string) => {
    if (guardReadOnlyRef.current()) return;
    const prev = categoriesRef.current.find((c) => c.id === id);
    if (!prev) return;

    setCategories((curr) => curr.filter((c) => c.id !== id));

    if (!apiUsable()) return;

    try {
      await commandsRef.current!.deactivateCategory(id);
    } catch (e) {
      setCategories((curr) => [prev, ...curr]);
      handleWriteErrorRef.current(e);
    }
  }, []);

  const addAccount = useCallback(
    async (input: {
      name: string;
      kind: "bank" | "cash" | "credit_card";
      initialBalanceCents: number;
    }) => {
      if (guardReadOnlyRef.current()) return;
      const optimisticId = `opt-${crypto.randomUUID()}`;
      const optimistic: Account = {
        id: optimisticId,
        name: input.name,
        balanceCents: input.initialBalanceCents,
        kind: input.kind === "credit_card" ? "credit_card" : "checking",
        status: "active",
      };
      setAccounts((prev) => [optimistic, ...prev]);

      if (!apiUsable()) return;

      try {
        const created = await commandsRef.current!.addAccount(input);
        setAccounts((prev) =>
          prev.map((a) =>
            a.id === optimisticId
              ? { ...created, color: a.color }
              : a,
          ),
        );
      } catch (e) {
        setAccounts((prev) => prev.filter((a) => a.id !== optimisticId));
        handleWriteErrorRef.current(e);
      }
    },
    [],
  );

  const addCategory = useCallback(
    async (input: {
      name: string;
      kind: "expense" | "income";
      parentId?: string;
    }) => {
      if (guardReadOnlyRef.current()) return;
      const optimisticId = `opt-${crypto.randomUUID()}`;
      const optimistic: Category = {
        id: optimisticId,
        name: input.name,
        kind: input.kind,
        icon: input.parentId ? "FolderOpen" : "Tag",
        parentId: input.parentId,
      };
      setCategories((prev) => [optimistic, ...prev]);

      if (!apiUsable()) return;

      try {
        const created = await commandsRef.current!.addCategory(input);
        setCategories((prev) =>
          prev.map((c) =>
            c.id === optimisticId ? { ...created, icon: c.icon } : c,
          ),
        );
      } catch (e) {
        setCategories((prev) => prev.filter((c) => c.id !== optimisticId));
        handleWriteErrorRef.current(e);
      }
    },
    [],
  );

  const addCard = useCallback(
    async (input: {
      name: string;
      creditLimitCents: number;
      closingDay: number;
      dueDay: number;
    }) => {
      if (guardReadOnlyRef.current()) return;
      const optimisticId = `opt-${crypto.randomUUID()}`;
      const optimistic: Account = {
        id: optimisticId,
        name: input.name,
        balanceCents: 0,
        kind: "credit_card",
        creditLimitCents: input.creditLimitCents,
        closingDay: input.closingDay,
        dueDay: input.dueDay,
        status: "active",
      };
      setAccounts((prev) => [optimistic, ...prev]);

      if (!apiUsable()) return;

      try {
        const created = await commandsRef.current!.createCard(input);
        setAccounts((prev) =>
          prev.map((a) =>
            a.id === optimisticId
              ? { ...created, color: a.color }
              : a,
          ),
        );
      } catch (e) {
        setAccounts((prev) => prev.filter((a) => a.id !== optimisticId));
        handleWriteErrorRef.current(e);
      }
    },
    [],
  );

  const updateCard = useCallback(
    async (
      id: string,
      input: {
        name?: string;
        creditLimitCents?: number;
        closingDay?: number;
        dueDay?: number;
      },
    ) => {
      if (guardReadOnlyRef.current()) return;
      const prev = accountsRef.current.find((a) => a.id === id);
      setAccounts((curr) =>
        curr.map((c) =>
          c.id === id
            ? {
                ...c,
                ...(input.name !== undefined ? { name: input.name } : {}),
                ...(input.creditLimitCents !== undefined
                  ? { creditLimitCents: input.creditLimitCents }
                  : {}),
                ...(input.closingDay !== undefined
                  ? { closingDay: input.closingDay }
                  : {}),
                ...(input.dueDay !== undefined
                  ? { dueDay: input.dueDay }
                  : {}),
              }
            : c,
        ),
      );

      if (!apiUsable() || !prev) return;

      try {
        const updated = await commandsRef.current!.updateCard(id, input);
        setAccounts((curr) =>
          curr.map((a) => (a.id === id ? { ...a, ...updated, color: a.color } : a)),
        );
      } catch (e) {
        setAccounts((curr) =>
          curr.map((a) => (a.id === id ? prev : a)),
        );
        handleWriteErrorRef.current(e);
      }
    },
    [],
  );

  const addSubscription = useCallback(
    async (input: {
      name: string;
      amountCents: number;
      cycle: "monthly" | "yearly" | "weekly";
      day: number;
      paymentMethod: string;
    }) => {
      if (guardReadOnlyRef.current()) return;
      const optimisticId = `opt-${crypto.randomUUID()}`;
      const optimistic: Subscription = {
        id: optimisticId,
        name: input.name,
        amountCents: input.amountCents,
        cycle: input.cycle,
        day: input.day,
        paymentMethod: input.paymentMethod,
        status: "active",
        createdAt: new Date().toISOString(),
      };
      setSubscriptions((prev) => [optimistic, ...prev]);

      if (!apiUsable()) return;

      try {
        const created = await commandsRef.current!.addSubscription(input);
        setSubscriptions((prev) =>
          prev.map((s) => (s.id === optimisticId ? created : s)),
        );
      } catch (e) {
        setSubscriptions((prev) => prev.filter((s) => s.id !== optimisticId));
        handleWriteErrorRef.current(e);
      }
    },
    [],
  );

  const cancelSubscription = useCallback(async (id: string) => {
    if (guardReadOnlyRef.current()) return;
    const prev = subsRef.current.find((s) => s.id === id);
    setSubscriptions((curr) =>
      curr.map((s) =>
        s.id === id ? { ...s, status: "cancelled" as const } : s,
      ),
    );

    if (!apiUsable() || !prev) return;

    try {
      await commandsRef.current!.cancelSubscription(id);
    } catch (e) {
      setSubscriptions((curr) =>
        curr.map((s) => (s.id === id ? prev : s)),
      );
      handleWriteErrorRef.current(e);
    }
  }, []);

  const updateSubscription = useCallback(async (
    id: string,
    input: {
      name?: string;
      amountCents?: number;
      cycle?: "monthly" | "yearly" | "weekly";
      day?: number;
      paymentMethod?: string;
    },
  ) => {
    if (guardReadOnlyRef.current()) return;
    const prev = subsRef.current.find((s) => s.id === id);
    if (!prev) return;
    // Optimistic update
    setSubscriptions((curr) =>
      curr.map((s) => s.id === id ? { ...s, ...input } : s),
    );

    if (!apiUsable()) return;

    try {
      await commandsRef.current!.updateSubscription(id, input);
    } catch (e) {
      // Rollback
      setSubscriptions((curr) =>
        curr.map((s) => (s.id === id ? prev : s)),
      );
      handleWriteErrorRef.current(e);
    }
  }, []);

  // ── Lazy load subscriptions (not fetched during bootstrap) ────

  const refreshSubscriptions = useCallback(async () => {
    const token = getAuthToken();
    if (!token) return;

    const adapter = createSubscriptionsAdapter({ token, online: apiUsable() });
    const result = await adapter.refresh();

    if (result === null) {
      // Offline — keep existing data (mock or empty)
      return;
    }

    setSubscriptions(result.data);
    setSyncFor("subscriptions", {
      source: result.source,
      syncedAt: result.syncedAt,
    });
  }, [setSyncFor]);

  const createTransfer = useCallback(
    async (input: {
      description: string;
      amountCents: number;
      date: string;
      fromAccountId: string;
      toAccountId: string;
    }) => {
      if (guardReadOnlyRef.current()) return;
      const optimisticId = `opt-${crypto.randomUUID()}`;
      const optimisticTx: Transaction = {
        id: optimisticId,
        description: input.description,
        amountCents: input.amountCents,
        date: input.date,
        kind: "transfer",
        categoryId: "",
        accountId: input.fromAccountId,
      };
      setTransactions((prev) => [optimisticTx, ...prev]);

      const prevFrom = accountsRef.current.find(
        (a) => a.id === input.fromAccountId,
      );
      const prevTo = accountsRef.current.find(
        (a) => a.id === input.toAccountId,
      );

      setAccounts((curr) =>
        curr.map((a) => {
          if (a.id === input.fromAccountId) {
            return {
              ...a,
              balanceCents: Math.max(0, a.balanceCents - input.amountCents),
            };
          }
          if (a.id === input.toAccountId) {
            return { ...a, balanceCents: a.balanceCents + input.amountCents };
          }
          return a;
        }),
      );

      if (!apiUsable()) return;

      try {
        await commandsRef.current!.createTransfer(input);
      } catch (e) {
        setTransactions((prev) => prev.filter((t) => t.id !== optimisticId));
        if (prevFrom) {
          setAccounts((curr) =>
            curr.map((a) => (a.id === input.fromAccountId ? prevFrom : a)),
          );
        }
        if (prevTo) {
          setAccounts((curr) =>
            curr.map((a) => (a.id === input.toAccountId ? prevTo : a)),
          );
        }
        handleWriteErrorRef.current(e);
        throw e;
      }
    },
    [],
  );

  // ── Payable create / cancel ─────────────────────────────────

  const cancelPayable = useCallback(async (id: string) => {
    if (guardReadOnlyRef.current()) return;
    const prev = payablesRef.current.find((p) => p.id === id);

    setPayables((curr) =>
      curr.map((p) =>
        p.id === id ? { ...p, status: "cancelled" as const } : p,
      ),
    );

    if (!apiUsable() || !prev) return;

    try {
      await commandsRef.current!.cancelPayable(id);
    } catch (e) {
      setPayables((curr) =>
        curr.map((p) => (p.id === id ? { ...prev } : p)),
      );
      handleWriteErrorRef.current(e);
    }
  }, []);

  const updatePayable = useCallback(
    async (id: string, input: {
      description?: string;
      amountCents?: number;
      dueDate?: string;
      accountId?: string;
      categoryId?: string;
    }) => {
      if (guardReadOnlyRef.current()) return;
      const prev = payablesRef.current.find((p) => p.id === id);
      if (!prev) return;

      // Optimistic update
      setPayables((curr) =>
        curr.map((p) =>
          p.id === id ? { ...p, ...input } : p,
        ),
      );

      if (!apiUsable()) return;

      try {
        await commandsRef.current!.updatePayable(id, input);
      } catch (e) {
        setPayables((curr) =>
          curr.map((p) => (p.id === id ? { ...prev } : p)),
        );
        handleWriteErrorRef.current(e);
      }
    },
    [],
  );

  const undoPayablePayment = useCallback(async (id: string) => {
    if (guardReadOnlyRef.current()) return;
    const prev = payablesRef.current.find((p) => p.id === id);
    if (!prev) return;

    // Optimistic update: change status back to pending/overdue
    const newStatus: Payable['status'] =
      new Date().toISOString().slice(0, 10) <= prev.dueDate ? 'pending' : 'overdue';
    setPayables((curr) =>
      curr.map((p) =>
        p.id === id ? { ...p, status: newStatus, paidDate: undefined as unknown as string | undefined } : p,
      ),
    );

    if (!apiUsable()) return;

    try {
      await commandsRef.current!.undoPayablePayment(id);
    } catch (e) {
      setPayables((curr) =>
        curr.map((p) => (p.id === id ? { ...prev } : p)),
      );
      handleWriteErrorRef.current(e);
    }
  }, []);

  const createPayable = useCallback(
    async (input: {
      accountId: string;
      description: string;
      amountCents: number;
      dueDate: string;
      categoryId?: string;
    }) => {
      if (guardReadOnlyRef.current()) return;
      const optimisticId = `opt-${crypto.randomUUID()}`;
      const optimistic: Payable = {
        id: optimisticId,
        description: input.description,
        amountCents: input.amountCents,
        dueDate: input.dueDate,
        status: "pending",
        categoryId: input.categoryId,
      };
      setPayables((prev) => [optimistic, ...prev]);

      if (!apiUsable()) return;

      try {
        const created = await commandsRef.current!.createPayable(input);
        setPayables((curr) =>
          curr.map((p) => (p.id === optimisticId ? created : p)),
        );
      } catch (e) {
        setPayables((curr) => curr.filter((p) => p.id !== optimisticId));
        handleWriteErrorRef.current(e);
      }
    },
    [],
  );

  // ── Budget create / update ──────────────────────────────────

  const createBudget = useCallback(
    async (input: {
      categoryId: string;
      name: string;
      amountCents: number;
      period: "monthly" | "quarterly" | "yearly";
      startDate: string;
    }) => {
      if (guardReadOnlyRef.current()) return;
      const optimistic: Budget = {
        id: `opt-${crypto.randomUUID()}`,
        categoryId: input.categoryId,
        name: input.name,
        amountCents: input.amountCents,
        spentCents: 0,
        period: input.period,
      };
      setBudgets((prev) => [optimistic, ...prev]);

      if (!apiUsable()) return;

      try {
        const created = await commandsRef.current!.createBudget(input);
        setBudgets((curr) =>
          curr.map((b) => (b.id === optimistic.id ? created : b)),
        );
      } catch (e) {
        setBudgets((curr) => curr.filter((b) => b.id !== optimistic.id));
        handleWriteErrorRef.current(e);
      }
    },
    [],
  );

  const updateBudget = useCallback(
    async (
      id: string,
      input: { amountCents?: number; alertThreshold?: number },
    ) => {
      if (guardReadOnlyRef.current()) return;
      const prev = budgetsRef.current.find((b) => b.id === id);
      if (!prev) return;

      setBudgets((curr) =>
        curr.map((b) =>
          b.id === id
            ? {
                ...b,
                ...(input.amountCents !== undefined
                  ? { amountCents: input.amountCents }
                  : {}),
              }
            : b,
        ),
      );

      if (!apiUsable()) return;

      try {
        await commandsRef.current!.updateBudget(id, input);
      } catch (e) {
        setBudgets((curr) =>
          curr.map((b) => (b.id === id ? prev : b)),
        );
        handleWriteErrorRef.current(e);
      }
    },
    [],
  );

  // ── Goal create / contribute / cancel ───────────────────────

  const createGoal = useCallback(
    async (input: {
      name: string;
      goalType: "savings" | "purchase" | "debt_payoff" | "emergency_fund";
      targetAmountCents: number;
      startDate: string;
    }) => {
      if (guardReadOnlyRef.current()) return;
      const optimistic: Goal = {
        id: `opt-${crypto.randomUUID()}`,
        name: input.name,
        goalType: input.goalType,
        targetAmountCents: input.targetAmountCents,
        currentAmountCents: 0,
      };
      setGoals((prev) => [optimistic, ...prev]);

      if (!apiUsable()) return;

      try {
        const created = await commandsRef.current!.createGoal(input);
        setGoals((curr) =>
          curr.map((g) => (g.id === optimistic.id ? created : g)),
        );
      } catch (e) {
        setGoals((curr) => curr.filter((g) => g.id !== optimistic.id));
        handleWriteErrorRef.current(e);
      }
    },
    [],
  );

  const contributeToGoal = useCallback(
    async (id: string, input: { amountCents: number }) => {
      if (guardReadOnlyRef.current()) return;
      const prev = goalsRef.current.find((g) => g.id === id);
      if (!prev) return;

      setGoals((curr) =>
        curr.map((g) =>
          g.id === id
            ? {
                ...g,
                currentAmountCents:
                  g.currentAmountCents + input.amountCents,
              }
            : g,
        ),
      );

      if (!apiUsable()) return;

      try {
        await commandsRef.current!.contributeToGoal(id, input);
      } catch (e) {
        setGoals((curr) =>
          curr.map((g) => (g.id === id ? { ...prev } : g)),
        );
        handleWriteErrorRef.current(e);
      }
    },
    [],
  );

  const cancelGoal = useCallback(async (id: string) => {
    if (guardReadOnlyRef.current()) return;
    const prev = goalsRef.current.find((g) => g.id === id);
    if (!prev) return;

    setGoals((curr) => curr.filter((g) => g.id !== id));

    if (!apiUsable()) return;

    try {
      await commandsRef.current!.cancelGoal(id);
    } catch (e) {
      setGoals((curr) => [prev, ...curr]);
      handleWriteErrorRef.current(e);
    }
  }, []);

  const updateGoal = useCallback(async (
    id: string,
    input: {
      name?: string;
      targetAmountCents?: number;
      targetDate?: string;
    },
  ) => {
    if (guardReadOnlyRef.current()) return;
    const prev = goalsRef.current.find((g) => g.id === id);
    if (!prev) return;

    setGoals((curr) =>
      curr.map((g) => g.id === id ? { ...g, ...input } : g),
    );

    if (!apiUsable()) return;

    try {
      await commandsRef.current!.updateGoal(id, input);
    } catch (e) {
      setGoals((curr) => curr.map((g) => (g.id === id ? prev : g)));
      handleWriteErrorRef.current(e);
    }
  }, []);

  const payStatement = useCallback(
    async (
      statementId: string,
      input: { amountCents: number; fromAccountId: string },
    ) => {
      if (guardReadOnlyRef.current()) return;
      const prevStmt = stmtsRef.current.find((s) => s.id === statementId);
      const prevAccount = accountsRef.current.find(
        (a) => a.id === input.fromAccountId,
      );

      setCardStatements((curr) =>
        curr.map((s) =>
          s.id === statementId
            ? {
                ...s,
                paidCents: s.paidCents + input.amountCents,
                status:
                  s.paidCents + input.amountCents >= s.totalCents
                    ? "paid"
                    : "partial",
              }
            : s,
        ),
      );
      setAccounts((curr) =>
        curr.map((a) =>
          a.id === input.fromAccountId
            ? {
                ...a,
                balanceCents: Math.max(
                  0,
                  a.balanceCents - input.amountCents,
                ),
              }
            : a,
        ),
      );

      if (!apiUsable()) return;

      try {
        const updated = await commandsRef.current!.payStatement(statementId, input);
        setCardStatements((curr) =>
          curr.map((s) =>
            s.id === statementId
              ? { ...s, ...updated }
              : s,
          ),
        );
      } catch (e) {
        if (prevStmt) {
          setCardStatements((curr) =>
            curr.map((s) => (s.id === statementId ? prevStmt : s)),
          );
        }
        if (prevAccount) {
          setAccounts((curr) =>
            curr.map((a) =>
              a.id === input.fromAccountId ? prevAccount : a,
            ),
          );
        }
        handleWriteErrorRef.current(e);
      }
    },
    [],
  );

  const createInstallments = useCallback(
    async (input: {
      accountId: string;
      description: string;
      totalAmountCents: number;
      purchaseDate: string;
      installmentsTotal: number;
      categoryId?: string;
    }) => {
      if (guardReadOnlyRef.current()) return;
      if (!apiUsable()) {
        setWriteError("API não configurada para parcelamentos");
        return;
      }

      try {
        await commandsRef.current!.createInstallments(input);
        const stmts = await endpoints.fetchStatements(input.accountId);
        setCardStatements(stmts);
      } catch (e) {
        handleWriteErrorRef.current(e);
        throw e;
      }
    },
    [],
  );

  // ── Profile adapter ────────────────────────────────────────
  // Injected persistence/API projection adapter. The adapter handles both
  // API mode (endpoints.patchProfile/fetchProfile) and local fallback mode
  // (localStorage). The provider facade (saveProfile, refreshProfile) is
  // unchanged.
  const profileAdapter = useMemo(
    () => createProfileAdapter({ apiUsable: apiUsable() }),
    [],
  );

  // ── Profile save/load ─────────────────────────────────────
  // Delegates to the injected adapter. When API is configured, the adapter
  // calls endpoints.patchProfile and returns the server projection; otherwise
  // it applies a local merge with defaults. In both cases setProfile is
  // called with the result.
  const saveProfile = useCallback(
    async (input: {
      name?: string;
      email?: string;
      phone?: string;
      avatarColor?: string;
      greetingStyle?: Profile["greetingStyle"];
    }) => {
      try {
        const result = await profileAdapter.save(input, profile);
        setProfile(result);
      } catch (e) {
        handleWriteErrorRef.current(e);
      }
    },
    [profile, profileAdapter],
  );

  const refreshProfile = useCallback(async () => {
    try {
      const fresh = await profileAdapter.refresh();
      if (fresh) setProfile(fresh);
    } catch {
      // ignore — keep previous profile state
    }
  }, [profileAdapter]);

  // ── Local-mode persistence for profile (mock/local-storage) ─
  // When the API is configured, saveProfile already persists server-side;
  // in mock mode we hydrate from localStorage on mount and write back
  // after every saveProfile call.
  useEffect(() => {
    if (apiUsable()) return;
    const local = profileAdapter.hydrate();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (local) setProfile(local);
  }, [profileAdapter]);

  useEffect(() => {
    if (apiUsable()) return;
    if (!profile) return;
    profileAdapter.persist(profile);
  }, [profile, profileAdapter]);


  return (
    <AppStateContext.Provider
      value={{
        accounts,
        categories,
        transactions,
        payables,
        budgets,
        goals,
        debts,
        subscriptions,
        cardStatements,
        profile,
        quickInsights,
        saveProfile,
        refreshProfile,
        sync,
        readOnly,
        loading,
        error,
        writeError,
        clearWriteError,
        addTransaction,
        updateTransaction,
        deleteTransaction,
        markPayablePaid,
        cancelPayable,
        updatePayable,
        undoPayablePayment,
        createPayable,
        createBudget,
        updateBudget,
        createGoal,
        contributeToGoal,
        cancelGoal,
        updateGoal,
        addAccount,
        updateAccount,
        deactivateAccount,
        addCategory,
        updateCategory,
        deactivateCategory,
        addCard,
        updateCard,
        addSubscription,
        cancelSubscription,
        updateSubscription,
        refreshSubscriptions,
        createTransfer,
        payStatement,
        createInstallments,
      }}
    >
      {children}
    </AppStateContext.Provider>
  );
}

export function useAppState(): AppState {
  const ctx = useContext(AppStateContext);
  if (!ctx)
    throw new Error("useAppState must be used within AppStateProvider");
  return ctx;
}
