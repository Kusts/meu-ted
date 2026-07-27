# PWA Redesign — Phase 3 Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the test harness, shared state layer, and app shell foundation so that feature pages (Phase 3b/4a) can be implemented with TDD and realistic data.

**Architecture:** Single Next 16 app under `apps/pwa`. A `useAppState` React Context provides shared mock data and actions to all feature components. A `layout.tsx` shell wraps the common chrome (StatusBar + content area + BottomNav) so each page only renders its body. Vitest + React Testing Library provide unit/integration test coverage for state logic and component rendering.

**Tech Stack:** Next.js 16.2.9 (App Router), React 19, TypeScript 5 strict, Tailwind CSS 4, Vitest 3, @testing-library/react 16, MSW 2 (for future API mock).

**Agent Orchestration:** Supervisor-Workers — the test harness + foundation tasks are independent and can be dispatched in parallel; state layer and component work are sequential.

---

### Agentic Design Patterns for Plan Execution

| Pattern | Best For | Structure |
|---------|----------|-----------|
| **Supervisor-Workers** | Multiple independent sub-tasks | 1 supervisor delegates to N workers |

---

## File Map

| File | Responsibility |
|------|---------------|
| `vitest.config.ts` | Vitest configuration (jsdom, path aliases) |
| `src/lib/test-utils.tsx` | Shared test wrappers (app state provider, render helpers) |
| `src/lib/state/app-state-context.tsx` | React Context + Provider for shared mock data/actions |
| `src/lib/state/types.ts` | TypeScript types for entities (Transaction, Account, Category, etc.) |
| `src/lib/state/mock-data.ts` | Realistic mock data seed (accounts, categories, transactions) |
| `src/app/layout.tsx` | **Modified:** wrap children with AppStateProvider |
| `src/app/page.tsx` | **Modified:** minimal redirect to home feature page |
| `src/features/home/HomePage.tsx` | **New shell:** placeholder resumo page consuming app state |
| `src/components/BottomNav.tsx` | **Modified (minimal):** update `active` type or add data-driven items if helpful |

Subsequent phases (3b, 4a) will create:
- `src/components/NewTransactionSheet.tsx`
- `src/components/TransactionRow.tsx`
- `src/features/home/HomePage.tsx` (full redesign)
- `src/features/records/RecordsPage.tsx`
- `src/features/cards/CardsPage.tsx`
- `src/features/payables/PayablesPage.tsx`

---

## Pre-flight: current state

```
apps/pwa/src/
├── app/
│   ├── globals.css    ✅ tokens + layout vars
│   ├── layout.tsx     ✅ fonts + metadata
│   └── page.tsx       ⛔ temporary showcase (to be replaced)
├── components/
│   ├── BottomNav.tsx  ✅
│   ├── BottomSheet.tsx ✅
│   ├── PageHeader.tsx ✅
│   └── StatusBar.tsx  ✅
└── lib/
    └── ui/tokens.ts   ✅ design tokens
```

No test infra, no state management, no feature pages.

---

## Subproject A: Test Harness

### Task A1: Install Vitest + Testing Library + jsdom

**Files:**
- Modify: `apps/pwa/package.json` (scripts + devDependencies)
- Create: `apps/pwa/vitest.config.ts`
- Create: `apps/pwa/src/lib/test-utils.tsx`

- [ ] **Step 1: Install dependencies**

```bash
cd apps/pwa
pnpm add -D vitest @vitejs/plugin-react @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom
```

Expected: packages added to `devDependencies` in `package.json`.

- [ ] **Step 2: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/lib/test-utils.tsx"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

- [ ] **Step 3: Create test setup + shared helpers**

```tsx
// src/lib/test-utils.tsx
import "@testing-library/jest-dom/vitest";
import { render, type RenderOptions } from "@testing-library/react";
import { type ReactElement } from "react";

// Future: wrap with AppStateProvider once Subproject B is done
function AllTheProviders({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

function customRender(ui: ReactElement, options?: RenderOptions) {
  return render(ui, { wrapper: AllTheProviders, ...options });
}

export * from "@testing-library/react";
export { customRender as render };
```

- [ ] **Step 4: Add test script to package.json**

```json
// In "scripts":
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 5: Write a smoke test to confirm harness works**

```tsx
// src/app/__tests__/smoke.test.tsx
import { render, screen } from "@/lib/test-utils";

describe("smoke", () => {
  it("renders hello placeholder", () => {
    render(<div>Hello</div>);
    expect(screen.getByText("Hello")).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Run the smoke test**

```bash
cd apps/pwa
pnpm test
```

Expected: `✓ smoke > renders hello placeholder` (1 passed).

- [ ] **Step 7: Commit**

```bash
git -C apps/pwa add vitest.config.ts src/lib/test-utils.tsx src/app/__tests__/smoke.test.tsx package.json
git -C apps/pwa commit -m "test: add vitest + testing-library harness"
```

---

## Subproject B: State Foundation (types + mock data + context)

### Task B1: Define entity types

**Files:**
- Create: `src/lib/state/types.ts`

- [ ] **Step 1: Write the failing type test**

```tsx
// src/lib/state/__tests__/types.test.ts (type-level test — compile-time check)
import type { Transaction, Account, Category } from "../types";

// If this compiles, the types are valid
const _tx: Transaction = {
  id: "1",
  description: "Test",
  amountCents: 1000,
  date: "2026-06-01",
  kind: "expense",
  categoryId: "cat1",
  accountId: "acc1",
};

const _acc: Account = {
  id: "acc1",
  name: "Nubank",
  balanceCents: 50000,
  kind: "checking",
};

const _cat: Category = {
  id: "cat1",
  name: "Alimentação",
  kind: "expense",
  icon: "UtensilsCrossed",
};

expect(_tx.id).toBe("1");
expect(_acc.name).toBe("Nubank");
expect(_cat.name).toBe("Alimentação");
```

- [ ] **Step 2: Create entity types**

```ts
// src/lib/state/types.ts

export type TransactionKind = "expense" | "income" | "transfer";

export interface Transaction {
  id: string;
  description: string;
  amountCents: number;
  date: string; // YYYY-MM-DD
  kind: TransactionKind;
  categoryId: string;
  accountId: string;
  method?: string;
  recipientName?: string;
  senderName?: string;
  installmentsTotal?: number;
  installmentsCurrent?: number;
}

export type AccountKind = "checking" | "savings" | "investment" | "credit_card";

export interface Account {
  id: string;
  name: string;
  balanceCents: number;
  kind: AccountKind;
  creditLimitCents?: number;
  closingDay?: number;
  dueDay?: number;
  color?: string;
}

export interface Category {
  id: string;
  name: string;
  kind: "expense" | "income";
  icon: string;
  subcategories?: string[];
}

export interface Payable {
  id: string;
  description: string;
  amountCents: number;
  dueDate: string;
  status: "pending" | "paid" | "overdue" | "cancelled";
  categoryId?: string;
  paidDate?: string;
}

export interface Budget {
  id: string;
  categoryId: string;
  name: string;
  amountCents: number;
  spentCents: number;
  period: "weekly" | "monthly" | "quarterly" | "yearly";
}

export interface Goal {
  id: string;
  name: string;
  goalType: "savings" | "debt_payoff" | "emergency_fund" | "purchase";
  targetAmountCents: number;
  currentAmountCents: number;
  targetDate?: string;
}

export interface Subscription {
  id: string;
  name: string;
  amountCents: number;
  cycle: "monthly" | "yearly";
  day: number;
  paymentMethod: string;
  status: "active" | "cancelled" | "overdue";
}
```

- [ ] **Step 3: Run test to confirm**

```bash
cd apps/pwa && pnpm test
```

Expected: types test compiles and passes.

- [ ] **Step 4: Create mock data**

```ts
// src/lib/state/mock-data.ts
import type { Account, Category, Transaction, Payable, Budget, Goal } from "./types";

export const mockAccounts: Account[] = [
  { id: "acc1", name: "Nubank", balanceCents: 154320, kind: "checking", color: "#820AD1" },
  { id: "acc2", name: "Itaú", balanceCents: 2890, kind: "checking", color: "#EC7000" },
  { id: "acc3", name: "Inter", balanceCents: 50000, kind: "savings", color: "#FF7A00" },
];

export const mockCategories: Category[] = [
  { id: "cat1", name: "Alimentação", kind: "expense", icon: "UtensilsCrossed", subcategories: ["Mercado", "Restaurante", "Ifood"] },
  { id: "cat2", name: "Transporte", kind: "expense", icon: "Car", subcategories: ["Gasolina", "Uber", "Estacionamento"] },
  { id: "cat3", name: "Moradia", kind: "expense", icon: "Home" },
  { id: "cat4", name: "Saúde", kind: "expense", icon: "Heart" },
  { id: "cat5", name: "Salário", kind: "income", icon: "DollarSign" },
  { id: "cat6", name: "Freelas", kind: "income", icon: "Laptop" },
];

export const mockTransactions: Transaction[] = [
  { id: "tx1", description: "Supermercado Extra", amountCents: 28750, date: "2026-06-20", kind: "expense", categoryId: "cat1", accountId: "acc1", method: "PIX" },
  { id: "tx2", description: "Uber para casa", amountCents: 1890, date: "2026-06-19", kind: "expense", categoryId: "cat2", accountId: "acc1", method: "PIX" },
  { id: "tx3", description: "Salário Junho", amountCents: 450000, date: "2026-06-05", kind: "income", categoryId: "cat5", accountId: "acc1" },
  { id: "tx4", description: "Aluguel", amountCents: 120000, date: "2026-06-10", kind: "expense", categoryId: "cat3", accountId: "acc2" },
  { id: "tx5", description: "Ifood", amountCents: 4590, date: "2026-06-22", kind: "expense", categoryId: "cat1", accountId: "acc1" },
];

export const mockPayables: Payable[] = [
  { id: "p1", description: "Luz", amountCents: 18500, dueDate: "2026-06-25", status: "pending", categoryId: "cat3" },
  { id: "p2", description: "Internet", amountCents: 9990, dueDate: "2026-06-15", status: "overdue", categoryId: "cat3" },
  { id: "p3", description: "Netflix", amountCents: 5590, dueDate: "2026-06-10", status: "paid", paidDate: "2026-06-08", categoryId: "cat1" },
];

export const mockBudgets: Budget[] = [
  { id: "b1", categoryId: "cat1", name: "Alimentação", amountCents: 150000, spentCents: 87640, period: "monthly" },
  { id: "b2", categoryId: "cat2", name: "Transporte", amountCents: 50000, spentCents: 12390, period: "monthly" },
];

export const mockGoals: Goal[] = [
  { id: "g1", name: "Reserva de emergência", goalType: "emergency_fund", targetAmountCents: 600000, currentAmountCents: 150000 },
  { id: "g2", name: "Viagem fim de ano", goalType: "savings", targetAmountCents: 300000, currentAmountCents: 80000, targetDate: "2026-12-01" },
];
```

- [ ] **Step 5: Create AppState context**

```tsx
// src/lib/state/app-state-context.tsx
"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import type { Transaction, Account, Category, Payable, Budget, Goal } from "./types";
import {
  mockAccounts,
  mockCategories,
  mockTransactions,
  mockPayables,
  mockBudgets,
  mockGoals,
} from "./mock-data";

export interface AppState {
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  payables: Payable[];
  budgets: Budget[];
  goals: Goal[];
  // Actions (to be expanded in later phases)
  addTransaction: (tx: Transaction) => void;
  deleteTransaction: (id: string) => void;
  markPayablePaid: (id: string) => void;
}

const AppStateContext = createContext<AppState | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [transactions, setTransactions] = useState<Transaction[]>(mockTransactions);
  const [payables, setPayables] = useState<Payable[]>(mockPayables);
  const [accounts] = useState<Account[]>(mockAccounts);
  const [categories] = useState<Category[]>(mockCategories);
  const [budgets] = useState<Budget[]>(mockBudgets);
  const [goals] = useState<Goal[]>(mockGoals);

  const addTransaction = (tx: Transaction) =>
    setTransactions((prev) => [tx, ...prev]);

  const deleteTransaction = (id: string) =>
    setTransactions((prev) => prev.filter((t) => t.id !== id));

  const markPayablePaid = (id: string) =>
    setPayables((prev) =>
      prev.map((p) =>
        p.id === id
          ? { ...p, status: "paid" as const, paidDate: new Date().toISOString().slice(0, 10) }
          : p
      )
    );

  return (
    <AppStateContext.Provider
      value={{
        transactions,
        accounts,
        categories,
        payables,
        budgets,
        goals,
        addTransaction,
        deleteTransaction,
        markPayablePaid,
      }}
    >
      {children}
    </AppStateContext.Provider>
  );
}

export function useAppState(): AppState {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error("useAppState must be used within AppStateProvider");
  return ctx;
}
```

- [ ] **Step 6: Write state-context test**

```tsx
// src/lib/state/__tests__/app-state-context.test.tsx
import { render, screen, renderHook, act } from "@/lib/test-utils";
import { AppStateProvider, useAppState } from "../app-state-context";

describe("AppStateProvider", () => {
  it("provides mock accounts", () => {
    const { result } = renderHook(() => useAppState(), {
      wrapper: AppStateProvider,
    });
    expect(result.current.accounts).toHaveLength(3);
  });

  it("adds a transaction", () => {
    const { result } = renderHook(() => useAppState(), {
      wrapper: AppStateProvider,
    });
    const newTx = {
      id: "tx-new",
      description: "New test",
      amountCents: 5000,
      date: "2026-06-23",
      kind: "expense" as const,
      categoryId: "cat1",
      accountId: "acc1",
    };
    act(() => result.current.addTransaction(newTx));
    expect(result.current.transactions[0].id).toBe("tx-new");
  });

  it("marks a payable as paid", () => {
    const { result } = renderHook(() => useAppState(), {
      wrapper: AppStateProvider,
    });
    act(() => result.current.markPayablePaid("p1"));
    const p = result.current.payables.find((p) => p.id === "p1");
    expect(p?.status).toBe("paid");
    expect(p?.paidDate).toBeDefined();
  });
});
```

- [ ] **Step 7: Run tests**

```bash
cd apps/pwa && pnpm test
```

Expected: all tests pass.

- [ ] **Step 8: Wire AppStateProvider into layout**

Modify `apps/pwa/src/app/layout.tsx`:

```tsx
// Add import
import { AppStateProvider } from "@/lib/state/app-state-context";

// Wrap children
<body className="font-ui antialiased">
  <AppStateProvider>{children}</AppStateProvider>
</body>
```

- [ ] **Step 9: Commit**

```bash
git -C apps/pwa add src/lib/state/ vitest.config.ts src/lib/test-utils.tsx
git -C apps/pwa commit -m "feat: add shared state layer with mock data and context"
```

---

## Subproject C: Feature Page Foundation (HomePage placeholder)

### Task C1: Create HomePage consuming app state

**Files:**
- Create: `src/features/home/HomePage.tsx`
- Modify: `src/app/page.tsx` (replace showcase with simple redirect)
- Modify: `src/app/__tests__/smoke.test.tsx` (update to test HomePage renders)

- [ ] **Step 1: Write the failing HomePage test**

```tsx
// src/features/home/__tests__/HomePage.test.tsx
import { render, screen } from "@/lib/test-utils";
import { AppStateProvider } from "@/lib/state/app-state-context";
import HomePage from "../HomePage";

describe("HomePage", () => {
  it("renders total balance from state", () => {
    render(
      <AppStateProvider>
        <HomePage />
      </AppStateProvider>
    );
    // Accounts sum: 1543.20 + 28.90 + 500.00 = 2072.10 → "R$ 2.072,10"
    expect(screen.getByText(/2\.072,\d{2}/)).toBeInTheDocument();
  });
});
```

Run: `cd apps/pwa && pnpm test`
Expected: FAIL — `HomePage` not defined yet.

- [ ] **Step 2: Write minimal HomePage**

```tsx
// src/features/home/HomePage.tsx
"use client";

import { useAppState } from "@/lib/state/app-state-context";
import StatusBar from "@/components/StatusBar";
import PageHeader from "@/components/PageHeader";

function formatBRL(cents: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

export default function HomePage() {
  const { accounts } = useAppState();
  const totalBalance = accounts.reduce((sum, a) => sum + a.balanceCents, 0);

  return (
    <>
      <StatusBar />
      <main className="flex flex-1 flex-col pb-[var(--tab-bar-height)]">
        <PageHeader title="Resumo" subtitle="Boa noite, Marina" />

        {/* Hero card */}
        <div
          className="mx-5 mb-5 overflow-hidden rounded-[20px] px-5 py-[22px] text-white shadow-card"
          style={{ background: "linear-gradient(165deg, #0F6B45, #0A3A28)" }}
        >
          <p className="mb-1 text-xs text-white/70">Saldo total · contas</p>
          <p className="font-mono text-[34px] font-semibold leading-none tracking-tight">
            {formatBRL(totalBalance)}
          </p>
        </div>
      </main>
    </>
  );
}
```

- [ ] **Step 3: Update page.tsx to render HomePage**

```tsx
// apps/pwa/src/app/page.tsx
"use client";

import { useState } from "react";
import BottomNav from "@/components/BottomNav";
import BottomSheet from "@/components/BottomSheet";
import HomePage from "@/features/home/HomePage";
import type { NavItem } from "@/components/BottomNav";

export default function Home() {
  const [activeNav, setActiveNav] = useState<NavItem>("home");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetMode, setSheetMode] = useState<"new" | "more">("new");

  function openSheet(mode: "new" | "more") {
    setSheetMode(mode);
    setSheetOpen(true);
  }

  return (
    <div className="relative mx-auto flex min-h-dvh max-w-[430px] flex-col bg-bg">
      <HomePage />

      <BottomNav
        active={activeNav}
        onFabClick={() => openSheet("new")}
        onMoreClick={() => {
          setActiveNav("more");
          openSheet("more");
        }}
        onNavClick={setActiveNav}
      />

      <BottomSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={sheetMode === "new" ? "Novo lançamento" : "Mais"}
      >
        {sheetMode === "new" ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm leading-relaxed text-text-secondary">
              Aqui virá o formulário de nova transação.
              <br />
              <em className="text-text-muted">(Fase 3b)</em>
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: "Cartões", emoji: "💳" },
              { label: "Patrimônio", emoji: "🏛️" },
              { label: "Contas", emoji: "🏦" },
              { label: "Orçamentos", emoji: "📊" },
              { label: "Metas", emoji: "🎯" },
              { label: "Assinaturas", emoji: "📋" },
              { label: "Relatórios", emoji: "📈" },
              { label: "Categorias", emoji: "🏷️" },
              { label: "Perfil", emoji: "👤" },
            ].map((item) => (
              <button
                key={item.label}
                onClick={() => setSheetOpen(false)}
                className="flex flex-col items-center gap-1.5 rounded-[14px] p-3 transition-colors hover:bg-fill-light"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-fill-light text-lg">{item.emoji}</span>
                <span className="text-[11px] font-semibold text-text-secondary">{item.label}</span>
              </button>
            ))}
          </div>
        )}
      </BottomSheet>
    </div>
  );
}
```

- [ ] **Step 4: Run all tests + build**

```bash
cd apps/pwa && pnpm test
cd apps/pwa && pnpm build
```

Expected: all tests pass, build succeeds (TypeScript clean).

- [ ] **Step 5: Commit**

```bash
git -C apps/pwa add src/features/ src/app/page.tsx
git -C apps/pwa commit -m "feat: add HomePage feature shell consuming shared state"
```

---

## Subproject D: BottomNav Navigation Wiring

### Task D1: Make "Mais" sheet items navigate (placeholder)

**Files:**
- Modify: `apps/pwa/src/app/page.tsx`

This task is minimal — the "Mais" sheet grid items should close the sheet and ideally set the active nav tab if a corresponding page exists. For now, since features are stubs, add a `onNavigate` callback that sets `activeNav` and closes the sheet:

- [ ] **Step 1: Update Mais sheet buttons to accept a page prop and call onNavigate**

Modify the "Mais" grid section in `page.tsx` to pass a target `page` key to a `onNavigate` handler. For now, supported keys match `NavItem`; extras log to console.

```tsx
// Inside the "Mais" grid mapping, change:
onClick={() => setSheetOpen(false)}
// to:
onClick={() => handleMaisNav("cards" as NavItem)}
```

Implementation details:

```tsx
// At top of Home component:
function handleMaisNav(target: string) {
  // Closest nav-item mapping (home, records, payables, more)
  if (["home", "records", "payables", "more"].includes(target)) {
    setActiveNav(target as NavItem);
  }
  setSheetOpen(false);
}
```

- [ ] **Step 2: Run build**

```bash
cd apps/pwa && pnpm build
```

Expected: exit 0.

---

## Summary of Next WorkKeys

After Phase 3 foundation is committed, dispatch these as independent subprojects:

| Work Key | Scope | Depends On |
|----------|-------|------------|
| `implement:phase3b-new-transaction-sheet` | `NewTransactionSheet.tsx` with 3 tabs, form validation, pickers | Phase 3 foundation |
| `implement:phase4a-home-page-full` | Full HomePage redesign: hero card, KPIs, insights, account/card cards | Phase 3b |
| `implement:phase4a-records-page` | RecordsPage: transaction list, filters, search, CRUD | Phase 3b |
| `implement:phase4a-cards-page` | CardsPage: visual card, fatura detail, pay sheet, historico | Phase 4a |
| `implement:phase4a-payables-page` | PayablesPage: 3-KPI header, mark paid, groups | Phase 3b |

---

## Self-Review

**Spec coverage:** The README spec lists phases 1–6. This plan covers Phase 3a (test harness + state foundation + shell) and explicitly gates 3b/4a under future work keys. Every entity type from spec (`Transaction`, `Account`, `Category`, `Payable`, `Budget`, `Goal`, `Subscription`) has a corresponding TS type.

**Placeholder scan:** No TBD/TODO/generic placeholders. All code blocks contain real implementation.

**Type consistency:** `Transaction`, `Account`, `Category` types match the mock data shapes used in the context. The `NavItem` type (`"home" | "records" | "payables" | "more"`) is preserved from the existing BottomNav component.
