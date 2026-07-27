# PWA Metas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development

**Goal:** Adicionar módulo Metas ao PWA com tela dedicada, criação, contribuições, barras de progresso.

**Architecture:** Feature-based em `src/features/goals/`. Backend: 4 endpoints REST em `pi-finance-api`. Padrão herdado.

**Agent Orchestration:** Single-Agent Looped — 5 slices sequenciais.

## ⚠️ Slice G-0: Backend REST

**Auditoria:** ZERO referências a goals em `pi-finance-api/src/` e `pi-finance-web/src/`.

Migration `V007__goals.sql`:
```sql
CREATE TABLE IF NOT EXISTS goals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id UUID NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    goal_type TEXT NOT NULL CHECK (goal_type IN ('savings','purchase','debt_payoff','emergency_fund')),
    target_amount_cents BIGINT NOT NULL CHECK (target_amount_cents > 0),
    current_amount_cents BIGINT NOT NULL DEFAULT 0,
    start_date DATE NOT NULL,
    target_date DATE,
    category_id UUID REFERENCES categories(id),
    account_id UUID REFERENCES accounts(id),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','achieved','cancelled','failed')),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS goal_contributions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    goal_id UUID NOT NULL REFERENCES goals(id),
    amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
    contribution_date DATE NOT NULL,
    source TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Endpoints: `GET /goals`, `POST /goals`, `POST /goals/:id/contribute`, `POST /goals/:id/cancel`.

## Slice G-1: Web — Tipos + API + Hooks + Schemas

Types: `Goal`, `GoalContribution`, `GoalList`. API: `getGoals`, `createGoal`, `contributeToGoal`, `cancelGoal`. Queries: `useGoals()`. Mutations: `useCreateGoal`, `useContributeToGoal`, `useCancelGoal`. Schema: `goalFormSchema`.

## Slice G-2: Web — Tab + GoalsPage base

7ª tab "Metas" (ícone `Flag`), `GoalsPage` com lista, barras de progresso, loading/empty/error.

## Slice G-3: Web — Sheets + contribuições

`GoalSheet` (criar), `ContributeSheet` (contribuir), integração na GoalsPage.

## Slice G-4: E2E + polish

Mock E2E, spec, ajustes finais.

## Verification

| Slice | Comando |
|---|---|
| G-0 | `npx tsc --noEmit && npx vitest run` (api) |
| G-1 | `npx tsc --noEmit && npx vitest run` (web) |
| G-2 | `npx vitest run src/features/goals/` |
| G-3 | `npx vitest run` |
| G-4 | `npm run build && npm run e2e` |

## Non-goals (V1)

- Sem edição de meta
- Sem progresso automático
- Sem notificações
- Sem múltiplos contribuidores
