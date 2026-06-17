# PWA Orçamentos — Module Design

**Data:** 2026-06-16
**Motivo:** terceiro módulo pós-V1 aprovado pelo usuário (escopo C). Orçamentos fecha o ciclo de controle financeiro: planejar gastos por categoria, acompanhar execução e receber alertas.
**Spec anterior:** `docs/superpowers/specs/2026-06-14-pwa-companion-design.md` (definiu Orçamentos como pós-V1); `docs/superpowers/specs/2026-06-16-pwa-cartoes-design.md` e `docs/superpowers/specs/2026-06-16-pwa-payables-design.md` (referências de estrutura).
**API:** Agent Pi tools `create_budget`, `list_budgets`, `check_budgets`, `budget_trends`, `suggest_budget_adjustment`, `update_budget`. Backend REST a ser implementado (Slice B-0).

## Context

- Módulos anteriores (Cartões, Contas a Pagar) estão completos com backend REST + PWA integrado.
- Orçamentos permitem definir limites de gasto por categoria em períodos (mensal, trimestral, anual).
- O usuário quer: criar/editar orçamento, ver status atual (gasto vs limite), alertas quando >80%, e tendência simples (últimos 3 meses).
- Escopo C aprovado: sem rollover complexo, sem metas (goals), sem orçamento semanal.
- A API `pi-finance-api` **não tem rotas REST de budgets**. Precisa de Slice B-0 (backend), seguindo o padrão de Cartões e Contas a Pagar.
- `apps/whatsapp-bridge` segue transport-only.
- Continuidade com o design system do PWA.
- Mobile-first.

## Decisions

| # | Decision | Choice | Reason | Rejected |
|---|---|---|---|---|
| D1 | Surface | **Tela própria "Orçamentos" como 6ª tab** + mini card na Home (alertas >80%) | Tela dedicada permite visão completa de todos os orçamentos ativos. Home alerta proativamente. Muitas tabs? Sim, mas o usuário aprovou | Só Home, mesclar com Carteira |
| D2 | Períodos | **Mensal, Trimestral, Anual** (semanal é pós-V1) | Cobre os ciclos mais comuns de orçamento | Semanal incluso |
| D3 | Progresso visual | **Barra de progresso horizontal** com cor por threshold: ≤80% teal, >80% amber, ≥100% red | Padrão consistente com Cartões (limit bar) | Donut chart, gauge |
| D4 | Rollover | **Sem rollover na V1** — cada período é independente | Escopo C; rollover adiciona complexidade de carry-over | Rollover automático |
| D5 | Tendência | **Gráfico de barras simples**: últimos 3 meses, gasto vs orçamento, com tooltip de % | Visual rápido; dados vêm de `budget_trends` ou cálculo client-side | Sem tendência, trendline complexa |
| D6 | Alertas | **Threshold visual na barra + badge "Atingido"** quando ≥100%. Sem notificações push na V1 | Simples e visível; consistente com Cartões | Push, email, WhatsApp |
| D7 | Edição | **Sheet de edição**: permite mudar limite (amountCents) e threshold de alerta | Escopo C: criar + editar | Só criar, sem editar |
| D8 | Categorias | **Uma categoria por orçamento**. Selector mostra apenas categorias de despesa ativas | Um orçamento = uma categoria. Simplifica tracking | Múltiplas categorias, subcategorias |
| D9 | Offline | **Read-only** com cache; ações de escrita desabilitadas | Padrão consolidado | Offline writes |
| D10 | Ordenação | **Por % usado DESC** (mais próximo do limite primeiro) | Prioriza o que precisa de atenção | Alfabética, por data |

## Architecture

### Surface

```
HomePage (resumo)
├─ Card "Orçamentos" (se houver budgets >0% used)
│  └─ Top 2 mais próximos do limite + link "Ver todos"

BudgetsPage (tab "Orçamentos")
├─ Lista de orçamentos ativos (ordenado por % usado DESC)
├─ Barra de progresso por orçamento
├─ FAB "+" → BudgetSheet (criar)
├─ Tap no row → EditBudgetSheet (editar limite/threshold)
└─ Seção "Tendência" (collapsible, últimos 3 meses)
```

### File map (alvo)

```
src/features/budgets/
├── BudgetsPage.tsx
├── budget-sheets.tsx
├── budgets-rows.test.tsx
└── budget-sheets.test.tsx

src/lib/api/
├── types.ts              # + Budget, BudgetTrend, BudgetList
├── finance-api.ts        # + getBudgets, createBudget, updateBudget, getBudgetTrends
├── queries.ts            # + useBudgets, useBudgetTrends
└── mutations.ts          # + useCreateBudget, useUpdateBudget

src/lib/forms/
└── schemas.ts            # + budgetFormSchema
```

## Requirements (EARS)

| ID | Type | Requirement |
|---|---|---|
| REQ-B1 | state-driven | A tab Orçamentos deve listar todos os orçamentos ativos do household, ordenados por % usado (DESC). Cada row mostra: nome da categoria, valor gasto, limite, barra de progresso colorida por threshold. |
| REQ-B2 | state-driven | Barra de progresso: ≤80% teal, >80% amber, ≥100% red. Label mostra "R$ X de R$ Y (Z%)". |
| REQ-B3 | event-driven | FAB "+" abre `BudgetSheet` para criar orçamento. Campos: categoria (select de despesa), limite (BRL), período (mensal/trimestral/anual), threshold de alerta (default 80%), data início. |
| REQ-B4 | event-driven | Tap em um orçamento existente abre `EditBudgetSheet` pré-preenchido com limite e threshold. Permite alterar e salvar. |
| REQ-B5 | state-driven | Seção "Tendência" (collapsible) mostra gráfico de barras dos últimos 3 meses: gasto real vs orçamento. Usa `budget_trends` ou cálculo client-side com `useTransactions`. |
| REQ-B6 | state-driven | HomePage: se houver orçamentos com uso >0%, mostrar card compacto com top 2 mais próximos do limite e link "Ver todos". |
| REQ-B7 | state-driven | Loading: 3 skeleton cards. Error: `getErrorMessage` + "Tentar novamente". Empty: ícone + "Nenhum orçamento" + hint. |
| REQ-B8 | state-driven | Offline: lista cacheada visível. FAB e edição desabilitados. |
| REQ-B9 | unwanted | V1 não permite: excluir orçamento, rollover, múltiplas categorias por orçamento, notificações push, orçamento semanal, metas (goals). |

## Data / API Matrix

| UI Action | Endpoint (esperado) | Agent Pi Tool | Response |
|---|---|---|---|
| Listar orçamentos | `GET /budgets` | `list_budgets` | `{ items: Budget[], total }` |
| Criar orçamento | `POST /budgets` | `create_budget` | `Budget` |
| Atualizar orçamento | `PATCH /budgets/:id` | `update_budget` | `Budget` |
| Verificar status | `GET /budgets/check` | `check_budgets` | `{ items: BudgetStatus[] }` |
| Tendência | `GET /budgets/:id/trends?monthsBack=3` | `budget_trends` | `{ items: BudgetTrend[] }` |

## Milestones

| # | Slice | Escopo |
|---|---|---|
| B-0 | Backend REST | Migration `V006__budgets.sql`, `BudgetStore` (in-memory + postgres), rotas `/budgets`, testes |
| B-1 | Web — tipos + API + hooks + schemas | Tipos, funções, queries, mutations, schemas Zod, testes |
| B-2 | Web — Tab + BudgetsPage base | Wire 6ª tab, lista com barra de progresso, loading/empty/error |
| B-3 | Web — Sheets + edição + Home card | BudgetSheet, EditBudgetSheet, Home card, integração |
| B-4 | Web — Tendência + E2E + polish | Gráfico de tendência, E2E, ajustes finais |

## Non-goals (V1)

- Sem metas (goals)
- Sem rollover
- Sem exclusão de orçamento
- Sem orçamento semanal
- Sem múltiplas categorias por orçamento
- Sem notificações push
- Sem escrita offline
