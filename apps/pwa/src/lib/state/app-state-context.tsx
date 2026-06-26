"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
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
import * as endpoints from "@/lib/api/endpoints";

// ── Idempotency key generator ─────────────────────────────────────

let idemCounter = 0;
function nextIdempotencyKey(): string {
  idemCounter += 1;
  return `pwa-${Date.now()}-${idemCounter}-${crypto.randomUUID().slice(0, 8)}`;
}

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
  // Fetch state
  loading: boolean;
  error: string | null;
  writeError: string | null;
  clearWriteError: () => void;
  // Write actions
  addTransaction: (tx: Transaction) => Promise<void>;
  deleteTransaction: (id: string) => Promise<void>;
  markPayablePaid: (id: string) => Promise<void>;
  addAccount: (input: {
    name: string;
    kind: "bank" | "cash" | "credit_card";
    initialBalanceCents: number;
  }) => Promise<void>;
  addCategory: (input: {
    name: string;
    kind: "expense" | "income";
    parentId?: string;
  }) => Promise<void>;
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

/** True when API base URL is configured AND an auth token exists */
function apiUsable(): boolean {
  return isApiConfigured() && getAuthToken() !== undefined;
}

export function AppStateProvider({ children }: { children: ReactNode }) {
  // ── State — initialized with mock data ────────────────────────────
  const [accounts, setAccounts] = useState<Account[]>(mockAccounts);
  const [categories, setCategories] = useState<Category[]>(mockCategories);
  const [transactions, setTransactions] =
    useState<Transaction[]>(ALL_MOCK_TRANSACTIONS);
  const [payables, setPayables] = useState<Payable[]>(mockPayables);
  const [budgets, setBudgets] = useState<Budget[]>(mockBudgets);
  const [goals, setGoals] = useState<Goal[]>(mockGoals);
  const [debts] = useState<Debt[]>(mockDebts);
  const [subscriptions, setSubscriptions] =
    useState<Subscription[]>(mockSubscriptions);
  const [cardStatements, setCardStatements] = useState<CardStatement[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [writeError, setWriteError] = useState<string | null>(null);
  const clearWriteError = useCallback(() => setWriteError(null), []);

  // Refs to keep latest state accessible in callbacks without stale closures
  const payablesRef = useRef(payables);
  payablesRef.current = payables;
  const accountsRef = useRef(accounts);
  accountsRef.current = accounts;
  const subsRef = useRef(subscriptions);
  subsRef.current = subscriptions;
  const txsRef = useRef(transactions);
  txsRef.current = transactions;
  const categoriesRef = useRef(categories);
  categoriesRef.current = categories;
  const stmtsRef = useRef(cardStatements);
  stmtsRef.current = cardStatements;

  const loadedRef = useRef(false);

  // ── Fetch from API when configured + token exists ─────────────────
  useEffect(() => {
    if (!apiUsable() || loadedRef.current) return;
    loadedRef.current = true;

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [accs, cats, txs, pays, buds, gos, subs, cards] =
          await Promise.all([
            endpoints.fetchAccounts(),
            endpoints.fetchCategories(),
            endpoints.fetchTransactions({ limit: 200 }),
            endpoints.fetchPayables(),
            endpoints.fetchBudgets(),
            endpoints.fetchGoals(),
            endpoints.fetchSubscriptions().catch(() => [] as Subscription[]),
            endpoints.fetchCards().catch(() => [] as Account[]),
          ]);

        if (!cancelled) {
          setAccounts(accs);
          setCategories(cats);
          setTransactions(txs.items);
          setPayables(pays);
          setBudgets(buds);
          setGoals(gos);
          setSubscriptions(subs);
          if (cards.length > 0) {
            endpoints.fetchStatements().then((stmts) => {
              if (!cancelled) setCardStatements(stmts);
            });
          }
        }
      } catch (e) {
        if (!cancelled) {
          setError((e as Error).message ?? "API fetch failed");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Write actions ─────────────────────────────────────────────────

  const addTransaction = useCallback(async (tx: Transaction) => {
    setTransactions((prev) => [tx, ...prev]);

    if (!apiUsable()) return;

    const key = nextIdempotencyKey();
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
      if (e instanceof Error) setWriteError(e.message);
    }
  }, []);

  const deleteTransaction = useCallback(async (id: string) => {
    const prev = txsRef.current.find((t) => t.id === id);
    setTransactions((prev) => prev.filter((t) => t.id !== id));

    if (!apiUsable() || !prev) return;

    try {
      await endpoints.deleteTransaction(id);
    } catch (e) {
      if (prev) setTransactions((curr) => [prev, ...curr]);
      if (e instanceof Error) setWriteError(e.message);
    }
  }, []);

  const markPayablePaid = useCallback(async (id: string) => {
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
      if (e instanceof Error) setWriteError(e.message);
    }
  }, []);

  const addAccount = useCallback(
    async (input: {
      name: string;
      kind: "bank" | "cash" | "credit_card";
      initialBalanceCents: number;
    }) => {
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
        if (e instanceof Error) setWriteError(e.message);
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
        if (e instanceof Error) setWriteError(e.message);
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
        if (e instanceof Error) setWriteError(e.message);
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
        if (e instanceof Error) setWriteError(e.message);
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
        if (e instanceof Error) setWriteError(e.message);
      }
    },
    [],
  );

  const cancelSubscription = useCallback(async (id: string) => {
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
      if (e instanceof Error) setWriteError(e.message);
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

      const key = nextIdempotencyKey();
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
        if (e instanceof Error) setWriteError(e.message);
      }
    },
    [],
  );

  const payStatement = useCallback(
    async (
      statementId: string,
      input: { amountCents: number; fromAccountId: string },
    ) => {
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
        if (e instanceof Error) setWriteError(e.message);
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
      if (!apiUsable()) {
        setWriteError("API não configurada para parcelamentos");
        return;
      }

      const key = nextIdempotencyKey();
      try {
        await endpoints.createInstallments(input);
        const stmts = await endpoints.fetchStatements(input.accountId);
        setCardStatements(stmts);
      } catch (e) {
        if (e instanceof Error) setWriteError(e.message);
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
        loading,
        error,
        writeError,
        clearWriteError,
        addTransaction,
        deleteTransaction,
        markPayablePaid,
        addAccount,
        addCategory,
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
