# PWA Metas — Module Design

**Data:** 2026-06-16
**Motivo:** quarto módulo pós-V1 aprovado pelo usuário. Metas fecha o ciclo de planejamento financeiro: definir objetivos de economia, acompanhar progresso.
**Spec anterior:** `docs/superpowers/specs/2026-06-16-pwa-budgets-design.md` (referência de estrutura).
**API:** Agent Pi tools `create_goal`, `list_goals`, `contribute_to_goal`, `cancel_goal`, `refresh_goals`. Backend REST a ser implementado (Slice G-0).

## Context

- Módulos anteriores (Cartões, Contas a Pagar, Orçamentos) estão completos com backend REST + PWA integrado.
- Metas permitem definir objetivos financeiros (ex: juntar R$ 10.000 para viagem, quitar dívida de R$ 5.000).
- A API `pi-finance-api` **não tem rotas REST de goals**. Precisa de Slice G-0 (backend).
- `apps/whatsapp-bridge` segue transport-only.

## Decisions

| # | Decision | Choice | Reason |
|---|---|---|---|
| D1 | Surface | **7ª tab "Metas"** | Tela dedicada permite visão completa |
| D2 | Tipos de meta | savings, purchase, debt_payoff, emergency_fund | Cobre casos comuns; income é redundante com tracking de receita |
| D3 | Progresso visual | **Barra de progresso + valor atual/meta** | Consistente com orçamentos |
| D4 | Contribuições | **Sheet de contribuir** com valor e data | Registra aportes manuais |
| D5 | Cálculo de progresso | **Client-side via transactions** na categoria associada, ou manual via contributions | Flexível |
| D6 | Offline | Read-only com cache | Padrão consolidado |

## Requirements (EARS)

| ID | Requirement |
|---|---|
| REQ-G1 | Listar metas com nome, tipo, valor atual, valor alvo, progresso %, barra visual |
| REQ-G2 | Criar meta com nome, tipo, valor alvo, data alvo, categoria, conta |
| REQ-G3 | Contribuir para meta com valor e data |
| REQ-G4 | Cancelar meta |
| REQ-G5 | Ordenar por % progresso DESC |
| REQ-G6 | Loading/empty/error states padrão |

## Data / API Matrix

| UI Action | Endpoint | Tool |
|---|---|---|
| Listar metas | `GET /goals` | `list_goals` |
| Criar meta | `POST /goals` | `create_goal` |
| Contribuir | `POST /goals/:id/contribute` | `contribute_to_goal` |
| Cancelar | `POST /goals/:id/cancel` | `cancel_goal` |

## Milestones

| # | Slice | Escopo |
|---|---|---|
| G-0 | Backend REST | Migration, GoalStore, 4 endpoints, testes |
| G-1 | Web — tipos + API + hooks + schemas | Tipos, funções, queries, mutations |
| G-2 | Web — Tab + GoalsPage base | Wire 7ª tab, lista com barras, loading/empty/error |
| G-3 | Web — Sheets + contribuições | GoalSheet, ContributeSheet, integração |
| G-4 | E2E + polish | Mock, spec, ajustes finais |

## Non-goals (V1)

- Sem edição de meta existente
- Sem progresso automático via transactions (contribuição manual)
- Sem notificações
- Sem múltiplos contribuidores
