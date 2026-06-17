# PWA Relatórios — Module Design

**Data:** 2026-06-17
**Motivo:** último módulo da sequência pós-V1. Relatórios consolida a visão analítica sobre todos os dados já capturados pelos módulos anteriores.
**Spec anterior:** `docs/superpowers/specs/2026-06-16-pwa-goals-design.md` (referência de estrutura).

## Context

- Módulos anteriores (Cartões, Contas a Pagar, Orçamentos, Metas) estão completos.
- O PWA já coleta dados ricos: transações, orçamentos, metas, cartões, contas a pagar.
- Relatórios V1 consolida esses dados em visualizações analíticas sem novos endpoints de backend — tudo é derivado de dados já existentes (transações, dashboard/summary, insights/quick).
- **Não há ferramentas Agent Pi específicas para relatórios** — é puramente uma camada de apresentação.
- `apps/whatsapp-bridge` segue transport-only.

## Key Decision: Surface

Com **7 tabs** já existentes no mobile (390px), adicionar uma 8ª tab é inviável. Relatórios será acessado via:

**D1: Entry point pela Home.** Um card "Relatórios" na HomePage com link para uma **tela full-screen** (não uma tab persistente). A tela é acessada via navegação interna (não tab bar), com back button "Voltar".

| # | Decision | Choice | Reason |
|---|---|---|---|
| D1 | Surface | Card na Home → tela full-screen com back button | 7 tabs é o limite prático; relatórios é consulta ocasional, não navegação diária |
| D2 | Dados | **Client-side apenas**: reuso de `useTransactions`, `useBudgets`, `useGoals`, `useDashboardSummary` | Zero novos endpoints; tudo já existe |
| D3 | Períodos | **Mês atual, mês passado, trimestre, ano, personalizado** | Flexibilidade sem complexidade |
| D4 | Visualizações | **Gráficos Recharts**: pizza (categorias), barras (mensal), linha (tendência) | Consistente com dashboard existente |
| D5 | Export | **Sem export na V1** (PDF/CSV são pós-V1) | Foco em visualização |

## Report Types (V1)

| Report | Dados | Visualização |
|---|---|---|
| Gastos por categoria | `useTransactions` filtrado por período | PieChart + tabela |
| Receitas por categoria | `useTransactions` filtrado por período | PieChart + tabela |
| Fluxo mensal | `useTransactions` agregado por mês | BarChart (12 meses) |
| Orçamentos vs Real | `useBudgets` + `useTransactions` | BarChart comparativo |
| Metas | `useGoals` | Progress bars |
| Resumo financeiro | `useDashboardSummary` | Cards KPI |

## Requirements (EARS)

| ID | Requirement |
|---|---|
| REQ-R1 | Card "Relatórios" na HomePage com link para tela full-screen |
| REQ-R2 | Tela com navegação interna: período selector + tipo de relatório |
| REQ-R3 | Gastos por categoria com PieChart e tabela |
| REQ-R4 | Fluxo mensal com BarChart 12 meses |
| REQ-R5 | Orçamentos vs Real com BarChart |
| REQ-R6 | Back button "Voltar" retorna à Home |
| REQ-R7 | Loading/error/empty states padrão |

## Architecture

```
HomePage
├─ Card "Relatórios" → navigate to ReportsPage (full-screen overlay)

ReportsPage
├─ Period selector: chips (Mês atual / Mês passado / Trimestre / Ano / Personalizado)
├─ Report type: tabs ou lista (Gastos / Receitas / Fluxo / Orçamentos / Metas)
├─ Chart area (Recharts)
└─ Data table
```

## File map

```
src/features/reports/
├── ReportsPage.tsx
├── reports-rows.test.tsx
```

No new backend endpoints. No new API types. Pure client-side composition.

## Milestones

| # | Slice | Escopo |
|---|---|---|
| R-1 | ReportsPage + Home card | Tela full-screen, period selector, back button, Home card |
| R-2 | Charts: gastos/receitas/fluxo | PieChart, BarChart reutilizando Recharts |
| R-3 | Orçamentos vs Real + Metas | BarChart comparativo, progress bars |
| R-4 | E2E + polish | Mock (reuso de dados existentes), spec, gates |

## Non-goals (V1)

- Sem exportação PDF/CSV
- Sem filtro por conta
- Sem drill-down
- Sem comparação ano a ano
- Sem novos endpoints backend
- Sem nova tab na barra inferior
