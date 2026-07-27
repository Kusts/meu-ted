# PWA Orçamentos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar módulo Orçamentos ao PWA com tela dedicada, criação/edição, barras de progresso por threshold, alertas visuais, tendência de 3 meses, e card de resumo na Home.

**Architecture:** Feature-based em `src/features/budgets/` com `BudgetsPage` (lista + barras + FAB), sheets testáveis (`budget-sheets.tsx`), extensões em `src/lib/api/` (tipos, funções, queries, mutations). Wire da 6ª tab em `App.tsx`. Backend: 5 endpoints REST em `pi-finance-api`. Padrão herdado: RHF + Zod, TanStack Query, idempotency-key, cache offline, mobile-first.

**Tech Stack:** React 19, TypeScript 6, Vite 8, Tailwind CSS 4, TanStack Query 5, React Hook Form 7 + Zod 4, lucide-react, Recharts (trend chart), Vitest + Testing Library, Playwright.

**Agent Orchestration:** Single-Agent Looped — 5 slices sequenciais.

---

## ⚠️ Dependency: Budget REST endpoints on pi-finance-api

**Auditoria:** `D:/projetos/pi-finance-api/src/routes/index.ts:1-41` — sem budget routes. `src/types/domain.ts` — sem Budget types. **Zero** referências a budget no backend e frontend.

### Slice B-0: Backend REST

Migration `V006__budgets.sql`:
```sql
CREATE TABLE IF NOT EXISTS budgets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id UUID NOT NULL,
    category_id UUID NOT NULL REFERENCES categories(id),
    name TEXT NOT NULL,
    amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
    period TEXT NOT NULL CHECK (period IN ('monthly','quarterly','yearly')),
    start_date DATE NOT NULL,
    end_date DATE,
    alert_threshold INTEGER NOT NULL DEFAULT 80 CHECK (alert_threshold >= 1 AND alert_threshold <= 100),
    rollover BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Endpoints:
- `GET /budgets` → `list_budgets`
- `POST /budgets` → `create_budget`
- `PATCH /budgets/:id` → `update_budget`
- `GET /budgets/check` → `check_budgets`
- `GET /budgets/:id/trends?monthsBack=3` → `budget_trends`

`BudgetStore` interface + in-memory + postgres implementations.

---

## Slice B-1: Web — Tipos + API + Hooks + Schemas

**Files:** `src/lib/api/types.ts`, `finance-api.ts`, `queries.ts`, `mutations.ts`, `src/lib/forms/schemas.ts`, `schemas.test.ts`

Types: `Budget`, `BudgetTrend`, `BudgetFilters`, `BudgetList`.
API: `getBudgets`, `createBudget`, `updateBudget`, `getBudgetTrends`.
Queries: `useBudgets()`, `useBudgetTrends(budgetId, monthsBack)`.
Mutations: `useCreateBudget`, `useUpdateBudget`.
Schemas: `budgetFormSchema` (categoryId, amount, period, alertThreshold, startDate).

---

## Slice B-2: Web — Tab + BudgetsPage base

**Files:** `src/App.tsx`, `src/features/budgets/BudgetsPage.tsx`, `budgets-rows.test.tsx`

- 6ª tab `Orçamentos` (ícone `PieChart` ou `Target`)
- `BudgetsPage`: lista com barras de progresso, loading/empty/error
- Ordenação por % usado DESC

---

## Slice B-3: Web — Sheets + Home card

**Files:** `budget-sheets.tsx`, `budget-sheets.test.tsx`, `HomePage.tsx`

- `BudgetSheet` (criar): category select, amount BRL, period select, alert threshold
- `EditBudgetSheet` (editar): pré-preenchido, permite alterar limite e threshold
- HomePage card: top 2 orçamentos mais próximos do limite

---

## Slice B-4: Web — Tendência + E2E + polish

**Files:** `e2e/budgets.spec.ts`, `e2e/helpers/api-mock.ts`

- Gráfico de barras (Recharts) com últimos 3 meses
- E2E mock + spec
- Ajustes de disabled/offline

---

## Verification Commands

| Slice | Comando |
|---|---|
| B-0 | `npx tsc --noEmit && npx vitest run` (api) |
| B-1 | `npx tsc --noEmit && npx vitest run` (web) |
| B-2 | `npx vitest run src/features/budgets/ src/App.test.tsx` |
| B-3 | `npx vitest run` |
| B-4 | `npm run build && npm run e2e` |

## Non-goals

- Sem metas (goals)
- Sem rollover
- Sem exclusão
- Sem orçamento semanal
- Sem multi-categoria
- Sem push
