# PWA Mock Fidelity Sweep

**Goal:** Bring every page of `apps/pwa` to visual fidelity with `design_handoff_pi_financeiro/App Financeiro Pi v2.dc.html`.

**Status:** completed.

## Source of truth
- `design_handoff_pi_financeiro/App Financeiro Pi v2.dc.html`
- `design_handoff_pi_financeiro/README.md`

## Per-page fidelity map

### 1. Resumo / HomePage
- [x] Saldo hero at `40px/600` with `-0.02em` letter-spacing (mock spec)
- [x] Mini-stats Receitas / Despesas / Resultado with tint overlays
- [x] KPI delta row: Receitas vs mês ant., Despesas vs mês ant. with arrow + percentage
- [x] Card "Contas a pagar · 7 dias" with danger tint border
- [x] Card "Gastos por categoria" with top categories chip rows + link to Relatórios
- [x] Insights list with severity color dot

### 2. Registros / RecordsPage
- [x] Search input + chip filters (Tudo / Despesas / Receitas / Transf. + 7d/30d/90d)
- [x] Grouped list by date (Hoje / Ontem / date)
- [x] Per-tx icon with category tint, description, category · account, signed amount
- [ ] Swipe/long-press to edit/delete (out of scope for visual sweep)

### 3. Nova transação sheet
- [ ] 3 abas (Despesa / Receita / Transferência)
- [ ] Input hero grande Space Grotesk 36px com prefixo R$
- [ ] Date picker inline
- [ ] Picker categoria + subcategoria
- [ ] Picker conta vs cartão separados
- [ ] Parcelamento (presets + livre)
- [ ] Criação inline de categoria/conta/cartão

### 4. Cartões / CardsPage
- [x] Visual de cartão físico 300x160 com gradiente por banco
- [x] Tabs Fatura atual / Histórico
- [ ] Pagar fatura sheet (com pagamento parcial)
- [ ] Histórico de faturas com sheet detalhe
- [ ] CRUD de cartão sheet

### 5. A pagar / PayablesPage
- [x] Header com 3 KPIs (Total / Pago / A pagar)
- [x] Filtros: Todas / Vencidas / Próximas / Pagas
- [x] Grupos: Vencidas, Próximas (7 dias), Pagas
- [x] Card de conta a pagar com badge status + botão Pago

### 6. Patrimônio / WalletPage
- [x] Hero verde com 32px/600
- [x] Mini-stats: Saldo em contas, Reservas/Metas, Faturas abertas (vermelho), Dívidas (vermelho)
- [x] Breakdown Ativos vs Passivos
- [x] Seção Contas + Seção Cartões

### 7. Contas / AccountsPage
- [x] Card por conta com logo banco + tipo + saldo
- [x] Mini histórico últimas 3 transações
- [x] Botão editar
- [ ] CRUD conta sheet

### 8. Orçamentos / BudgetsPage
- [x] Tabs Despesas / Receitas (previsão)
- [x] Resumo "Você usou R$ X de R$ Y"
- [x] Card por categoria: ícone + nome + barra colorida + % + gasto/limite
- [x] Cores da barra: verde < 80%, âmbar 80–99%, vermelho ≥ 100%

### 9. Metas & Dívidas / GoalsPage
- [x] Tabs Metas / Dívidas
- [x] Card de meta: nome + prazo + ícone + atual/alvo + barra + botão Contribuir
- [x] Card de dívida: ícone vermelho + taxa + X/Y parcelas + 3 KPIs (Pago / Restante / Total) + barra
- [x] Dot-grid: verde ✓, âmbar atual, cinza pendente
- [ ] "Ver todas as N parcelas" expand

### 10. Assinaturas / SubscriptionsPage
- [x] Card resumo total mensal
- [x] Tabs Ativas / Canceladas
- [x] Card: logo + nome + ciclo + valor + dia + forma pagamento + status badge
- [ ] CRUD assinatura sheet

### 11. Relatórios / ReportsPage
- [x] Period selector: Mês / Anterior / Trim. / Ano
- [x] KPI cards: Ticket médio / Taxa poupança
- [x] Donut chart gastos por categoria (CSS conic-gradient)
- [x] Bar chart fluxo mensal (6 meses)
- [x] Top 5 categorias barra horizontal
- [x] Linha evolução patrimonial (SVG)

### 12. Categorias / CategoriesPage
- [x] Seção Despesas + seção Receitas
- [x] Card categoria: ícone tintado + nome + botão "+ Sub" + editar
- [x] Subcategorias inline expandidas com chips + botão "×"
- [ ] Input inline para criar subcategoria

### 13. Perfil / ProfilePage
- [x] Avatar circular verde + nome + email
- [x] Lista de itens: Editar perfil, Segurança, Notificações, Chat com Pi (WhatsApp)
- [x] Botão "Sair da conta"
- [ ] Editar perfil sheet com nome/email/telefone
- [ ] Segurança sheet com 2FA e sessões
- [x] Chat com Pi sheet com botão WhatsApp

## Implementation order

1. ~~Home (delta KPIs + saldo 40px)~~
2. ~~Wallet (patrimônio hero)~~
3. ~~Cards (visual 300x160 + tabs)~~
4. ~~Payables (3 KPIs + grupos)~~
5. ~~Budgets (tabs + barras coloridas)~~
6. ~~Goals (dot-grid)~~
7. ~~Reports (gráficos)~~
8. ~~Categories / Subscriptions / Profile~~
9. ~~NewTransactionSheet (3 abas + parcelamento + inline)~~

## Sheets implementadas

- [x] Pagar Fatura sheet (total/parcial + conta de origem)
- [x] Editar perfil sheet (nome/email/telefone)
- [x] Segurança sheet (alterar senha, 2FA, sessões)
- [x] Chat com Pi sheet (verde + WhatsApp)
- [x] Nova conta sheet
- [x] Novo cartão sheet (bandeira/limite/fechamento/vencimento)
- [x] Nova categoria sheet (ícone + cor)
- [x] Nova assinatura sheet (presets + ciclo + pagamento)
- [x] Novo orçamento sheet
- [x] Nova meta sheet
- [x] Nova conta a pagar sheet (com recorrência)
- [x] NewTransactionSheet com parcelamento (toggle + slider 2x-48x)