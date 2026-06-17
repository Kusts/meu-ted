# PWA Relatórios — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development

**Goal:** Adicionar tela de Relatórios ao PWA com gráficos analíticos reutilizando dados existentes, acessível via card na Home.

**Architecture:** Tela full-screen (`ReportsPage`) com back button, sem nova tab. Zero novos endpoints backend — tudo derivado de `useTransactions`, `useBudgets`, `useGoals`, `useDashboardSummary`. Recharts para gráficos.

**Agent Orchestration:** Single-Agent Looped — 4 slices.

## ⚠️ Zero backend changes

Diferente dos módulos anteriores, Relatórios **não requer novos endpoints REST**. Todos os dados já estão disponíveis via:
- `GET /transactions` (com filtros de data)
- `GET /dashboard/summary`
- `GET /insights/quick`
- `GET /budgets`
- `GET /goals`

## Slice R-1: ReportsPage + Home card

**Files:** `src/features/reports/ReportsPage.tsx`, `src/features/home/HomePage.tsx`

- Card "Relatórios" na HomePage com ícone `BarChart3`
- Navegação para `ReportsPage` (full-screen, não tab)
- `ReportsPage` com back button "← Voltar", period selector (chips), loading/empty state
- Sem gráficos ainda — placeholder

## Slice R-2: Charts — gastos, receitas, fluxo

- PieChart de gastos por categoria (reuso de `useTransactions` + agregação client-side)
- PieChart de receitas por categoria
- BarChart de fluxo mensal (12 meses, receitas vs despesas)
- Recharts `PieChart`, `BarChart`, `ResponsiveContainer`

## Slice R-3: Orçamentos vs Real + Metas

- BarChart comparativo: orçamento vs gasto real por categoria
- Progress bars de metas
- Reuso de `useBudgets` e `useGoals`

## Slice R-4: E2E + polish

- `e2e/reports.spec.ts`
- Reuso dos mocks existentes (transactions, budgets, goals)
- Ajustes finais de loading/error/empty

## Verification

| Slice | Comando |
|---|---|
| R-1 | `npx tsc --noEmit && npx vitest run src/features/reports/` |
| R-2 | `npx vitest run` |
| R-3 | `npx vitest run` |
| R-4 | `npm run build && npm run e2e` |

## Non-goals (V1)

- Sem exportação PDF/CSV
- Sem filtro por conta
- Sem drill-down
- Sem comparação ano a ano
- Sem novos endpoints backend
- Sem nova tab na barra inferior
