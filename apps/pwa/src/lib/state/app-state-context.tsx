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
import { type DomainKey, saveDomain, loadDomain } from "./snapshot-store";
import { useSession } from "@/lib/auth/session-context";
import { ApiError } from "@/lib/api/client";
import * as endpoints from "@/lib/api/endpoints";

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
    stmtsRef.current = cardStatements;
  });

  // Applies one settled list-domain result: live on success (+persist), snapshot if cached,
  // else "unavailable" (empty + backend-down). NEVER mock.
  const applyListDomain = useCallback(
    function <K extends Exclude<DomainKey, "transactions">>(
      domain: K,
      result: PromiseSettledResult<unknown>,
      token: string,
      setData: (d: unknown) => void,
    ): void {
      if (result.status === "fulfilled") {
        const value = result.value as never;
        setData(value);
        saveDomain(token, domain, value);
        setSyncFor(domain, {
          source: "live",
          syncedAt: new Date().toISOString(),
        });
        return;
      }
      const snap = loadDomain(token, domain);
      if (snap) {
        setData(snap.data);
        setSyncFor(domain, { source: "snapshot", syncedAt: snap.syncedAt });
      } else {
        setData([]);
        setSyncFor(domain, { source: "unavailable", syncedAt: null });
      }
    },
    [setSyncFor],
  );

  // ── Fetch from API when configured + token exists ─────────────────
  useEffect(() => {
    if (!apiUsable() || loadedRef.current) return;
    loadedRef.current = true;

    let cancelled = false;

    const load = async () => {
      const token = getAuthToken();
      if (!token) return;
      setLoading(true);
      setError(null);

      const results = await Promise.allSettled([
        endpoints.fetchAccounts(),
        endpoints.fetchCategories(),
        endpoints.fetchTransactions({ limit: 200 }),
        endpoints.fetchPayables(),
        endpoints.fetchBudgets(),
        endpoints.fetchGoals(),
        endpoints.fetchSubscriptions(),
        endpoints.fetchStatements(),
      ]);
      if (cancelled) return;

      // Runtime 401 short-circuit across ALL domains (Task 5 wires the side-effect).
      const unauthorized = results.some(
        (r) =>
          r.status === "rejected" &&
          r.reason instanceof ApiError &&
          r.reason.status === 401,
      );
      if (unauthorized) {
        expireSession();
        setLoading(false);
        return;
      }

      applyListDomain("accounts", results[0], token, (d) =>
        setAccounts(d as Account[]),
      );
      applyListDomain("categories", results[1], token, (d) =>
        setCategories(d as Category[]),
      );
      // transactions has shape { items, total }: unwrap before applying
      if (results[2].status === "fulfilled") {
        const items = (results[2].value as { items: Transaction[] }).items;
        setTransactions(items);
        saveDomain(token, "transactions", items);
        setSyncFor("transactions", {
          source: "live",
          syncedAt: new Date().toISOString(),
        });
      } else {
        const snap = loadDomain(token, "transactions");
        if (snap) {
          setTransactions(snap.data);
          setSyncFor("transactions", {
            source: "snapshot",
            syncedAt: snap.syncedAt,
          });
        } else {
          setTransactions([]);
          setSyncFor("transactions", {
            source: "unavailable",
            syncedAt: null,
          });
        }
      }
      applyListDomain("payables", results[3], token, (d) =>
        setPayables(d as Payable[]),
      );
      applyListDomain("budgets", results[4], token, (d) =>
        setBudgets(d as Budget[]),
      );
      applyListDomain("goals", results[5], token, (d) =>
        setGoals(d as Goal[]),
      );
      applyListDomain("subscriptions", results[6], token, (d) =>
        setSubscriptions(d as Subscription[]),
      );
      applyListDomain("cardStatements", results[7], token, (d) =>
        setCardStatements(d as CardStatement[]),
      );

      const anyFailed = results.some((r) => r.status === "rejected");
      if (anyFailed)
        setError("Alguns dados não puderam ser atualizados.");
      setLoading(false);
    };

    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Write actions ─────────────────────────────────────────────────

  const addTransaction = useCallback(async (tx: Transaction) => {
    if (guardReadOnlyRef.current()) return;
    setTransactions((prev) => [tx, ...prev]);

    if (!apiUsable()) return;

    try {
      if (tx.kind === "expense") {
        const created = await endpoints.createExpenseTransaction({
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
        const created = await endpoints.createIncomeTransaction({
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
        await endpoints.updateTransaction(id, input);
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
      await endpoints.deleteTransaction(id);
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
      await endpoints.markPayablePaid(id, today);
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
        await endpoints.updateAccount(id, input);
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
      await endpoints.deactivateAccount(id);
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
        await endpoints.updateCategory(id, input);
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
      await endpoints.deactivateCategory(id);
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
        const created = await endpoints.addAccount(input);
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
        const created = await endpoints.addCategory(input);
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
        const created = await endpoints.createCard(input);
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
        const updated = await endpoints.updateCard(id, input);
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
        const created = await endpoints.addSubscription(input);
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
      await endpoints.cancelSubscription(id);
    } catch (e) {
      setSubscriptions((curr) =>
        curr.map((s) => (s.id === id ? prev : s)),
      );
      handleWriteErrorRef.current(e);
    }
  }, []);

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
        await endpoints.createTransfer(input);
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
      }
    },
    [],
  );

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
        const updated = await endpoints.payStatement(statementId, input);
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
        await endpoints.createInstallments(input);
        const stmts = await endpoints.fetchStatements(input.accountId);
        setCardStatements(stmts);
      } catch (e) {
        handleWriteErrorRef.current(e);
      }
    },
    [],
  );

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
