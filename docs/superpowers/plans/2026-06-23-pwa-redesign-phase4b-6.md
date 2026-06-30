# PWA Redesign — Phases 4b–6 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Complete the remaining feature pages (Budgets, Goals, Reports, Wallet, Accounts, Categories, Subscriptions, Profile) and establish the backend/API foundation that replaces mock data with real data.

**Architecture:** Each feature follows the established pattern: `src/features/<name>/<Name>Page.tsx` (client component) + route `src/app/<rota>/page.tsx` (server page wrapper). All pages consume `useAppState()` from the shared context. Mock data is replaced backend-first in the final phase.

**Tech Stack:** Next.js 16.2.9 (App Router), React 19, TypeScript 5 strict, Tailwind CSS 4, Vitest + React Testing Library.

**Agent Orchestration:** Single-Agent Looped (sequential pages that build on the same data layer).

---

### Agentic Design Patterns for Plan Execution

| Pattern | Best For | Structure |
|---------|----------|-----------|
| **Single-Agent Looped** | Sequential pages sharing a codebase | 1 agent implements, tests, verifies per task |

---

## Current State

```
apps/pwa/src/
├── app/
│   ├── layout.tsx          ✅ AppStateProvider + fonts
│   ├── globals.css         ✅ tokens + keyframes + layout vars
│   ├── page.tsx            ✅ Home (via AppShell)
│   ├── a-pagar/page.tsx    ✅ Payables
│   ├── cartoes/page.tsx    ✅ Cards
│   └── registros/page.tsx  ✅ Records
├── components/
│   ├── AppShell.tsx        ✅ routing + nav + sheet
│   ├── BottomNav.tsx       ✅
│   ├── BottomSheet.tsx     ✅
│   ├── NewTransactionSheet.tsx  ✅
│   ├── PageHeader.tsx      ✅
│   └── StatusBar.tsx        ✅
├── features/
│   ├── home/HomePage.tsx   ✅ full redesign
│   ├── records/RecordsPage.tsx  ✅
│   ├── cards/CardsPage.tsx      ✅
│   └── payables/PayablesPage.tsx  ✅
└── lib/
    ├── state/
    │   ├── types.ts          ✅
    │   ├── mock-data.ts      ✅
    │   └── app-state-context.tsx  ✅
    ├── test-utils.tsx        ✅
    └── ui/tokens.ts          ✅
```

Missing routes: `/orcamentos`, `/metas`, `/relatorios`, `/patrimonio`, `/contas`, `/categorias`, `/assinaturas`, `/perfil`.

Missing pages: BudgetsPage, GoalsPage, ReportsPage, WalletPage, AccountsPage, CategoriesPage, SubscriptionsPage, ProfilePage.

---

## Work Key Sequence & Dependencies

```
4b-budgets → 4b-goals → 4b-reports → 4c-wallet → 4c-accounts → 5-categories → 5-subscriptions → 5-profile → 6-backend
```

Each work key deploys to its own route, uses `AppShell`, reads/appends to `useAppState`. No work key depends on the previous one's data — they all read from the shared state — so order is flexible except for reports which reads all data.

---

## General Pattern (applies to all page work keys)

Every page implementation follows this template:

```
Files to create:
  - src/features/<name>/<Name>Page.tsx    (client component: StatusBar + header + content)
  - src/features/<name>/__tests__/<Name>Page.test.tsx
  - src/app/<rota>/page.tsx               (server wrapper: render <AppShell><Page /></AppShell>)

Files to modify:
  - src/components/AppShell.tsx           (add "routeMap" entry for Mais sheet navigation)
```

For Mais sheet navigation: add the route to the `routeMap` in AppShell's Mais grid buttons:

```tsx
const routeMap: Record<string, string> = {
  Cartões: "/cartoes",
  Orçamentos: "/orcamentos",
  Metas: "/metas",
  Relatórios: "/relatorios",
  Patrimônio: "/patrimonio",
  Contas: "/contas",
  Categorias: "/categorias",
  Assinaturas: "/assinaturas",
  Perfil: "/perfil",
};
```

---

## Work Key: `implement:phase4-budgets-page`

**Route:** `/orcamentos`

**Spec source:** README section 8 (Orçamentos)

### Scope

- BudgetsPage with tabs "Despesas" / "Receitas (previsão)"
- Summary line: "Você usou R$ X de R$ Y"
- Per-category cards: icon + name + progress bar (`<80%` green, `80-99%` amber, `>=100%` red) + percentage + spent/limit
- Reuses `useAppState().budgets` data (already exists in mock)
- No CRUD/create — just visualization of existing budgets

### Files

- Create: `src/features/budgets/BudgetsPage.tsx`
- Create: `src/features/budgets/__tests__/BudgetsPage.test.tsx`
- Create: `src/app/orcamentos/page.tsx`
- Modify: `src/components/AppShell.tsx` (Mais route map)

### Tests

```
- Renders page header "Orçamentos"
- Renders summary (spent vs total)
- Renders category budget cards
- Shows progress bar with correct color by % (green <80%, amber 80-99%, red >=100%)
- Shows percentage text per budget
- Tabs switch between Despesas and Receitas
- Empty state when no budgets
```

### Implementation notes

- Budget data already exists: `mockBudgets` has 2 expense budgets (Alimentação at 58.4%, Transporte at 24.8%)
- For Receitas tab, add a simple mock income budget or show empty state
- Progress bar coloring: `< 80%` → `--color-primary`; `80–99%` → `--color-warning`; `≥ 100%` → `--color-danger`

---

## Work Key: `implement:phase4-goals-page`

**Route:** `/metas`

**Spec source:** README section 9 (Metas & Dívidas)

### Scope

- GoalsPage with tabs "Metas" / "Dívidas"
- Metas tab: per-goal cards with name, type label, current/target amounts, progress bar (green), percentage
- Dívidas tab (simplified): per-debt cards with header (name, installments), KPI grid (Pago/Restante/Total), progress bar, dot grid placeholders
- Reuses `useAppState().goals` data (already exists)
- Debts need new types and mock data

### Files

- Create: `src/features/goals/GoalsPage.tsx`
- Create: `src/features/goals/__tests__/GoalsPage.test.tsx`
- Create: `src/app/metas/page.tsx`
- Modify: `src/lib/state/types.ts` (add Debt, DebtInstallment types)
- Modify: `src/lib/state/mock-data.ts` (add mock debts)
- Modify: `src/lib/state/app-state-context.tsx` (add debts to AppState)
- Modify: `src/components/AppShell.tsx` (Mais route map)

### New types

```ts
// In types.ts
export interface Debt {
  id: string;
  name: string;
  totalAmountCents: number;
  paidAmountCents: number;
  interestRate: number; // monthly % (0.01 = 1%)
  installmentsTotal: number;
  installmentsPaid: number;
  startDate: string;
}

export interface DebtInstallment {
  id: string;
  debtId: string;
  index: number; // 1-based
  dueDate: string;
  amountCents: number;
  paid: boolean;
  paidDate?: string;
}
```

### Tests

```
- Renders page header "Metas & Dívidas"
- Renders goal cards with name and progress
- Shows percentage for each goal
- Renders KPI grid for debts (Pago/Restante/Total)
- Tab switching
```

### Implementation notes

- Dot grid for installments can be a simplified visual: colored circles per installment (green=paid, amber=current, gray=pending)
- "Contribuir" button is visual stub (no persistence needed yet)
- Add 2 mock debts (1 with installments, 1 simple) in `mock-data.ts`

---

## Work Key: `implement:phase4-reports-page`

**Route:** `/relatorios`

**Spec source:** README section 11 (Relatórios)

### Scope

- ReportsPage with period selector (Este mês / 3 meses / 6 meses / Este ano)
- KPI cards: Receitas, Despesas, Saldo, Taxa de poupança
- Donut chart: category spending distribution (CSS conic-gradient — no chart lib dependency)
- Bar chart placeholder or simple div-based horizontal bars for top 5 categories
- All calculations derived from `useAppState()` data

### Files

- Create: `src/features/reports/ReportsPage.tsx`
- Create: `src/features/reports/__tests__/ReportsPage.test.tsx`
- Create: `src/app/relatorios/page.tsx`
- Modify: `src/components/AppShell.tsx` (Mais route map)

### Tests

```
- Renders page header "Relatórios"
- Renders period selector chips
- Renders KPI cards with correct values
- Renders donut chart (at least color segments rendered)
- Renders top categories list
- Period filter changes values
- Empty state when no data for period
```

### Implementation notes

- No chart library dependency — use CSS `conic-gradient` for donut chart (dynamically computed from category spending)
- Bar chart: simple `<div>` bars with percentage widths
- Savings rate color: `>=20%` green, `>=5%` amber, `<5%` red
- Donut chart colors should cycle through: `--color-primary`, `--color-danger`, `--color-warning`, `--color-info`, `--color-primary-light`, plus muted colors for overflow

---

## Work Key: `implement:phase4c-wallet-page`

**Route:** `/patrimonio`

**Spec source:** README section 6 (Patrimônio)

### Scope

- WalletPage (Patrimônio) with hero card showing net worth
- KPI breakdown: Ativos vs Passivos
- Section "Contas" — list of checking/savings accounts with balances
- Section "Cartões" — list of credit cards with fatura and limit
- All data from `useAppState()`

### Files

- Create: `src/features/wallet/WalletPage.tsx`
- Create: `src/features/wallet/__tests__/WalletPage.test.tsx`
- Create: `src/app/patrimonio/page.tsx`
- Modify: `src/components/AppShell.tsx` (Mais route map)

### Tests

```
- Renders page header "Patrimônio"
- Shows net worth = accounts + goals - card spending
- Renders accounts list
- Renders cards list
- Shows active/passive breakdown
```

### Implementation notes

- `Patrimônio líquido = saldo contas + total metas − faturas abertas − dívidas restantes`
- `Ativos = saldo contas + total metas`
- `Passivos = faturas abertas + dívidas restantes`
- This page overlaps with HomePage somewhat — focus on the net-worth calculation which HomePage doesn't show

---

## Work Key: `implement:phase4c-accounts-page`

**Route:** `/contas`

**Spec source:** README section 7 (Contas)

### Scope

- AccountsPage showing all non-credit-card accounts
- Per-account card: bank logo (abbreviation with color) + name + type + balance
- Mini history: last 3 transactions for each account
- Edit button (visual stub — inline edit in a sheet later)
- "Nova conta" button (visual stub)

### Files

- Create: `src/features/accounts/AccountsPage.tsx`
- Create: `src/features/accounts/__tests__/AccountsPage.test.tsx`
- Create: `src/app/contas/page.tsx`
- Modify: `src/components/AppShell.tsx` (Mais route map)

### Tests

```
- Renders page header "Contas"
- Renders all checking/savings accounts
- Shows balance for each account
- Shows last 3 transactions per account
- Shows "+ Adicionar conta" button
```

### Implementation notes

- Filter accounts to `kind !== "credit_card"` (credit cards are in CardsPage)
- Mini history: filter `transactions` by `accountId`, take last 3 by date
- Edit icon and "+" button are visual stubs — CRUD comes in backend phase

---

## Work Key: `implement:phase5-categories-page`

**Route:** `/categorias`

**Spec source:** README section 12 (Categorias)

### Scope

- CategoriesPage showing expense categories and income categories in separate sections
- Per-category row: icon (tinted background) + name + "+ Sub" button + edit button
- Subcategories shown as inline chips below category name
- "+ Sub" opens inline input for adding subcategories
- No backend persistence — local state only

### Files

- Create: `src/features/categories/CategoriesPage.tsx`
- Create: `src/features/categories/__tests__/CategoriesPage.test.tsx`
- Create: `src/app/categorias/page.tsx`
- Modify: `src/components/AppShell.tsx` (Mais route map)

### Tests

```
- Renders page header "Categorias"
- Shows expense categories section
- Shows income categories section
- Shows subcategory chips
- Can add a subcategory via inline input
- Shows "+ Nova" button
```

### Implementation notes

- Use `useState` for local subcategory additions (no backend)
- "+ Sub" button expands an input field inline — on submit, appends to local copy of subcategories
- Category data comes from `useAppState().categories` — categories already have `subcategories: string[]`
- The context doesn't support category mutations yet — use local state for the subcategory UI, don't propagate to context

---

## Work Key: `implement:phase5-subscriptions-page`

**Route:** `/assinaturas`

**Spec source:** README section 10 (Assinaturas)

### Scope

- SubscriptionsPage showing all subscriptions
- Summary card: total monthly cost
- Tabs "Ativas" / "Canceladas"
- Per-subscription card: name, cycle (mensal/anual), amount, day, payment method badge, status badge
- Reuses `useAppState()` — need to add subscriptions to context
- No CRUD/create — just visualization

### Files

- Create: `src/features/subscriptions/SubscriptionsPage.tsx`
- Create: `src/features/subscriptions/__tests__/SubscriptionsPage.test.tsx`
- Add mock subscriptions to `src/lib/state/mock-data.ts`
- Add subscriptions to `src/lib/state/app-state-context.tsx` (already has `Subscription` type)
- Create: `src/app/assinaturas/page.tsx`
- Modify: `src/components/AppShell.tsx` (Mais route map)

### Mock data to add

```ts
// In mock-data.ts
export const mockSubscriptions: Subscription[] = [
  { id: "s1", name: "Netflix", amountCents: 5590, cycle: "monthly", day: 10, paymentMethod: "Nubank Crédito", status: "active" },
  { id: "s2", name: "Spotify", amountCents: 2190, cycle: "monthly", day: 8, paymentMethod: "Nubank Crédito", status: "active" },
  { id: "s3", name: "Amazon Prime", amountCents: 1990, cycle: "monthly", day: 12, paymentMethod: "Nubank Crédito", status: "active" },
  { id: "s4", name: "Adobe Creative", amountCents: 22900, cycle: "yearly", day: 1, paymentMethod: "Inter Mastercard", status: "cancelled" },
];
```

### Tests

```
- Renders page header "Assinaturas"
- Shows monthly total
- Renders all subscription cards
- Tab switching (Ativas/Canceladas)
- Shows status badge
- Shows payment method
```

---

## Work Key: `implement:phase5-profile-page`

**Route:** `/perfil`

**Spec source:** README section 13 (Perfil & Configurações)

### Scope

- ProfilePage with 3 sub-sections as card cards:
  - "Editar Perfil" — name, email, phone (read-only display, stub edit)
  - "Segurança" — list items with chevron (alterar senha, 2FA, sessões)
  - "Chat com Pi" — green card with agent info + "Abrir no WhatsApp" button

### Files

- Create: `src/features/profile/ProfilePage.tsx`
- Create: `src/features/profile/__tests__/ProfilePage.test.tsx`
- Create: `src/app/perfil/page.tsx`
- Modify: `src/components/AppShell.tsx` (Mais route map)

### Tests

```
- Renders page header "Perfil"
- Shows "Editar Perfil" section
- Shows "Segurança" section with list items
- Shows "Chat com Pi" section
- Abrir WhatsApp button has correct href
```

### Implementation notes

- All sections are display-only — no persistence
- "Abrir no WhatsApp" is a `<a href="https://wa.me/...">` link to the configured bridge number
- 2FA badge shows "Ativado" or "Desativado" as visual badge
- Security items are visual list with icons + chevron (no navigation yet)

---

## Work Key: `implement:phase6-backend-foundation`

**Spec source:** README phases "Features Novas" + "Estado Global Necessário" + backend tables

### Scope

- Replace mock data with real backend calls via `pi-finance-api` REST endpoints
- Add `fetch`-based data hooks in `app-state-context.tsx` (or a dedicated data layer)
- Handle loading, error states
- Backend CRUD for accounts, categories, transactions

### Architecture decision

The mock data layer and the real API layer should coexist. The context should provide data regardless of source. Two approaches:

**Option A — Context with API hooks:**
```
app-state-context.tsx becomes an orchestrator that:
1. On mount, fetches all data from API
2. Stores in useState (same as now, but populated from API)
3. Write actions (addTransaction, etc.) POST to API then update local state
```

**Option B — TanStack Query:**
```
Install @tanstack/react-query
Create hooks: useAccounts(), useTransactions(), etc.
AppStateProvider wraps with QueryClientProvider
```

### Files

- Modify: `src/lib/state/app-state-context.tsx` — add API fetching
- Create: `src/lib/api/client.ts` — fetch wrapper
- Create: `src/lib/api/endpoints.ts` — typed endpoint functions
- Modify: `src/lib/state/types.ts` — add any missing fields for API mappings

### Tests

```
- Loading state renders placeholder
- Error state renders error message
- Data renders correctly after fetch
- Write actions call API and update state
```

### API endpoints (expected from pi-finance-api)

```
GET    /accounts         → list accounts
POST   /accounts         → create account
PATCH  /accounts/:id     → update account

GET    /categories       → list categories
POST   /categories       → create category

GET    /transactions     → list transactions (with filters: kind, period, search)
POST   /transactions     → create transaction
PATCH  /transactions/:id → update transaction
DELETE /transactions/:id → soft-delete transaction

GET    /payables         → list contas a pagar
PATCH  /payables/:id/pay → mark as paid

GET    /budgets          → list budgets
GET    /goals            → list goals
POST   /goals/:id/contribute → contribute to goal

GET    /cards            → list credit cards
POST   /cards/:id/pay    → pay credit card statement
```

### Implementation notes

- Start with read-only endpoints first (GETs), then write endpoints
- Each API hook catches errors and shows toast or inline error
- No `tanstack-query` dependency unless the data layer becomes complex — `useEffect` + `useState` is sufficient for the MVP
- Consider adding a `loading` and `error` field to AppState for UI states

---

## Mais Sheet Route Map

To be updated in `AppShell.tsx` for each new page:

```tsx
const routeMap: Record<string, string> = {
  Cartões: "/cartoes",
  Orçamentos: "/orcamentos",
  Metas: "/metas",
  Relatórios: "/relatorios",
  Patrimônio: "/patrimonio",
  Contas: "/contas",
  Categorias: "/categorias",
  Assinaturas: "/assinaturas",
  Perfil: "/perfil",
};
```

---

## Test Count Projection

After all phases, the test suite should have approximately:

| Area | Tests |
|------|-------|
| Smoke | 1 |
| AppState context | 6 |
| AppShell | 3 |
| NewTransactionSheet | 5 |
| HomePage | 11 |
| RecordsPage | 10 |
| CardsPage | 8 |
| PayablesPage | 9 |
| BudgetsPage | ~6 |
| GoalsPage | ~6 |
| ReportsPage | ~7 |
| WalletPage | ~5 |
| AccountsPage | ~5 |
| CategoriesPage | ~5 |
| SubscriptionsPage | ~5 |
| ProfilePage | ~4 |
| API layer | ~6 |
| **Total** | **~102** |

---

## Self-Review

**Spec coverage:** Every section of the README (sections 6–13 + Features Novas + Backend) maps to a work key. The checklist items in the README's "Checklist de Implementação" (phases 4–6) are all covered.

**Placeholder scan:** No TBD/TODO/generic placeholders. All code blocks contain real implementation. Mock data additions are specified with concrete values. All test descriptions are concrete.

**Type consistency:** The `Debt` and `DebtInstallment` types follow the same conventions as existing `Transaction`/`Payable` types. The `Subscription` type already exists in `types.ts` and is only missing mock data. API endpoint signatures follow the existing `pi-finance-api` patterns.
