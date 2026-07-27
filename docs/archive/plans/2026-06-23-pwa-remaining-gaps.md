# Plano: Correção dos Gaps Pendentes

**Status atual**: ~16 de 20 gaps corrigidos. Restam 4.

---

## Gap 1 — Cartões: Card Detail Drill-Down ❌

**Mock**: Ao clicar num cartão, navega para tela de detalhe com:
- Back button "← Cartões" + botão "Editar" (pill branco)
- Hero card com 3 KPIs lado a lado: Fatura / Vence dia / Limite livre
- Botão "Pagar fatura" (verde full-width)
- "Compras da fatura" (tag chips + data)
- "Histórico de faturas" (status badges)

**PWA atual**: Mostra tudo inline com tabs (Fatura/Histórico). As compras aparecem abaixo de cada cartão.

**Solução**: Adicionar estado `selectedCard` e toggle entre list view e detail view.
- Lista de cartões (estado atual)
- Ao clicar, esconde lista e mostra detail com back button
- Detail reusa o PayStatementSheet existente para "Pagar fatura"

**Arquivos**: `apps/pwa/src/features/cards/CardsPage.tsx`

---

## Gap 2 — Goals: Expand List com Toggle ⚠️

**Mock**: Quando expandido, cada parcela mostra:
- Ícone 32×32 `border-radius:9px` (checkmark se paga, número se pendente)
- Mês + status label colorido
- Valor
- Toggle button 28×28 `border-radius:8px` (marca como paga/pendente)

**PWA atual**: Lista simples de parcelas sem toggle interativo.

**Solução**: Reescrever a seção expandida com o layout do mock (statusBg, statusColor, toggle button).

**Arquivos**: `apps/pwa/src/features/goals/GoalsPage.tsx`

---

## Gap 3 — Orçamentos: Income Tab Summary Text ⚠️

**Mock**: "Previsão de receitas para o mês — compare com o que já entrou."

**PWA atual**: Mostra texto diferente.

**Solução**: Ajustar texto do summary line quando `tab === "income"`.

**Arquivos**: `apps/pwa/src/features/budgets/BudgetsPage.tsx`

---

## Gap 4 — Cartões: Tabs vs Detail UX ⚠️

**Mock**: NÃO tem tabs "Fatura atual / Histórico". Tem drill-down ao clicar no cartão.

**PWA atual**: Tabs no topo.

**Solução**: Remover tabs, implementar navegação por drill-down (gap 1 já cobre isso).

**Arquivos**: `apps/pwa/src/features/cards/CardsPage.tsx`

---

## Ordem de execução

1. **Budgets** (gap 3) — 1 linha, trivial
2. **Goals expand list** (gap 2) — ~30 linhas
3. **Cartões drill-down** (gaps 1+4) — refactor maior, ~100 linhas
