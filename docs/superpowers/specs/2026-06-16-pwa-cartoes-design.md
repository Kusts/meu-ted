# PWA Cartões — Module Design

**Data:** 2026-06-16
**Motivo:** primeiro módulo pós-V1 da sequência PWA aprovada pelo usuário. Cartões foi eleito slice #1 pelo audit `audit:pwa-next-slices` (maior impacto, fundação parcial existente: `Account.kind === 'credit_card'`, badge nos Registros, `getAccountIcon` branch `credit_card`).
**Spec anterior:** `docs/superpowers/specs/2026-06-14-pwa-companion-design.md` (definiu Cartões como pós-V1).
**API:** `pi-finance-api` — endpoints de cartão já completos e testados (12 tools: `create_credit_card_account`, `create_card_purchase`, `create_card_installments`, `create_recurring_purchase`, `pay_statement`, `list_statements`, `get_statement_details`, `card_insights`, `check_card_limits`, `refresh_statements`, `list_recurring_purchases`, `post_due_recurring`).

## Context

- O PWA V1 (Resumo / Registros / Carteira) está completo e verificado (93 testes, typecheck limpo, build ok).
- Compras de cartão já aparecem nos Registros com badge `<CreditCard>` e ícone indigo em `getAccountIcon`, mas o usuário não tem gestão de faturas, limites ou pagamento.
- A lacuna atual: o usuário vê compras de cartão como despesas, mas não sabe quanto deve na fatura, quando fecha, quando vence, ou quanto do limite já usou.
- O módulo Cartões adiciona uma **4ª tab** (`Cartões`) com drill-down: cartões → faturas → detalhe da fatura → pagamento.
- A API `pi-finance-api` expõe endpoints de cartão como tools do Agent Pi — o PWA os consome via `X-Device-Token` como os demais módulos.
- `apps/whatsapp-bridge` segue transport-only, sem lógica de cartão.
- Continuidade com o design system: Tailwind 4 + tokens em `index.css` + classe `.card` + ícones `lucide-react` + padrão "light premium — Copilot Money + Monarch".
- Mobile-first (PWA instalado no iPhone), com graceful degradation em desktop.
- Padrões herdados do V1: RHF + Zod para forms, TanStack Query para dados, idempotency-key estável por submissão, retry sem fechar sheet, mensagens PT-BR.

## Decisions

| # | Decision | Choice | Reason | Rejected |
|---|---|---|---|---|
| D1 | Navegação | **Drill-down hierárquico**: lista de cartões → faturas de um cartão → detalhe da fatura | Mobile-first: navegação profunda com back button é natural em PWA instalado; evita abas aninhadas | Tabs secundárias, split-view desktop |
| D2 | Lista de cartões | Cada cartão como **card resumo** com: nome, ícone `CreditCard` indigo, barra de progresso (usado/limite), dias de fechamento/vencimento, cor por threshold | Visual scan rápido; Copilot Money usa padrão similar | Tabela, lista simples sem barra |
| D3 | Threshold de limite | **Verde** ≤80%, **Âmbar** >80%, **Vermelho** >100% (`check_card_limits` como endpoint opcional; cálculo client-side fallback com `usedCents/limitCents`) | Alerta visual sem depender de endpoint extra | Sem threshold, só número |
| D4 | Pagamento — atalhos | **Chips 25% / 50% / 75% / 100%** + campo "Outro valor" custom | UX de quitação parcial rápida; 100% cobre pagamento total; custom cobre casos não-redondos | Slider, input livre sem shortcuts |
| D5 | Pagamento — conta origem | **Filtra contas `kind !== 'credit_card'`** no selector | Evita pagar fatura com outro cartão (não faz sentido financeiro) | Permitir qualquer conta |
| D6 | Compra parcelada — preview | Sheet mostra **valor da parcela** (`total / N`) + **lista dos N meses** com data estimada de cada fatura | Usuário vê o impacto mensal antes de confirmar | Só mostrar valor da parcela sem meses |
| D7 | Recorrência — escopo V1 | Criar recorrência (**sem cancelar, sem editar**) | Aderente ao "sem cancelamento de recorrência na V1" travado pelo planner | CRUD completo de recorrências |
| D8 | Formulários | **RHF + Zod**, idempotency-key estável (`useRef(crypto.randomUUID())`), retry sem fechar sheet | Padrão V1 consolidado; testável; seguro contra duplicatas | Formik, validação só server-side |
| D9 | Status de fatura | **6 estados**: `open`, `closed`, `paid`, `partial`, `overdue`, `cancelled`. Cores: open=blue, closed=amber, paid=green, partial=teal, overdue=red, cancelled=slate | Cobre ciclo completo da fatura; `refresh_statements` atualiza status | Menos estados (só open/paid) |
| D10 | Offline | **Read-only** com cache (TanStack Query `placeholderData` + Workbox SWR); ações de escrita desabilitadas com `disabled={!online}` | Padrão V1; sem conflito de escrita offline | Offline writes, fila de sincronização |
| D11 | Compra parcelada vs avulsa | Compra **N=1 é avulsa** (`create_card_purchase`); **N>1 é parcelada** (`create_card_installments`) | API tem endpoints distintos; single-installment não gera parcelamento desnecessário | Unificar em um endpoint |
| D12 | Insights de cartão | `card_insights` e `check_card_limits` como **V1.1 opcional** (stretch) — não bloqueiam V1 | Limite via cálculo client-side já supre o alerta básico; insights aprofundam pós-lançamento | Feature completa day-1 |
| D13 | Edição de compra faturada | **Não permitida na V1** (travado pelo planner) | Evita complexidade de reabertura de fatura, ajuste de limite, e race conditions | Edição inline, undo |

## Architecture

### File map (alvo)

```
src/features/cards/
├── CardsPage.tsx              # página principal: lista de cartões (default) + navegação interna
├── card-sheets.tsx            # PurchaseSheet, InstallmentSheet, RecurringSheet, PaySheet (testáveis)
├── cards-rows.test.tsx        # testes de componente: cards, statements, detail rows
└── card-sheets.test.tsx       # testes de sheet: validação, conversão BRL→cents, retry, atalhos

src/lib/api/
├── finance-api.ts             # + funções: getStatements, getStatementDetail, createCardPurchase, createCardInstallments, createRecurringPurchase, payStatement
├── queries.ts                 # + hooks: useStatements, useStatementDetail, useCardLimits (opcional), useCardInsights (opcional)
├── mutations.ts               # + hooks: useCreateCardPurchase, useCreateCardInstallments, useCreateRecurring, usePayStatement
└── types.ts                   # + tipos: CreditCardAccount (extends Account), Statement, StatementPurchase, RecurringPurchase

src/lib/forms/
└── schemas.ts                 # + schemas: cardPurchaseSchema, installmentPurchaseSchema, recurringSchema, paySchema
```

### Feature tree

```
CardsPage
├─ state: selectedCardId, view ('cards' | 'statements' | 'detail'), statementId
├─ data:  accounts (useAccounts → filter kind=credit_card), statements (useStatements), detail (useStatementDetail)
│
├─ View: cards (default)
│  ├─ loading: Skeleton cards (3x)
│  ├─ error:   getErrorMessage + "Tentar novamente"
│  ├─ empty:   CreditCard icon (size 40, text-slate-300) + "Nenhum cartão cadastrado"
│  │           + hint "Cadastre um cartão pelo WhatsApp para começar."
│  └─ items:  CardSummaryCard para cada conta credit_card
│     ├─ Nome do cartão + ícone CreditCard (indigo)
│     ├─ Barra de progresso (usado/limite, cor por threshold)
│     ├─ Labels: "Fechamento dia X · Vencimento dia Y"
│     ├─ Valores: "R$ X.XXX usado de R$ Y.YYY"
│     └─ onTap → setView('statements'), setSelectedCardId
│
├─ View: statements (com back button)
│  ├─ Header: nome do cartão + ícone
│  ├─ loading / error / empty ("Nenhuma fatura")
│  └─ items: StatementRow para cada fatura (ordenado por data de fechamento DESC)
│     ├─ Período: "Jun/26" (fechamento) ou "Fechamento 15 jun"
│     ├─ Status badge (open/closed/paid/partial/overdue)
│     ├─ Total, Pago, Saldo devedor
│     └─ onTap → setView('detail'), setStatementId
│
├─ View: detail (com back button)
│  ├─ Header: período + status badge + total, pago, restante
│  ├─ Seção: Pagamento
│  │  ├─ Payment shortcuts: chips 25% / 50% / 75% / 100% do restante
│  │  ├─ Campo "Outro valor" (BRL, RHF)
│  │  ├─ Selector de conta origem (filtrado: kind !== 'credit_card')
│  │  └─ Botão "Pagar" (disabled se !online ou valor inválido)
│  ├─ Lista de compras
│  │  ├─ loading / empty ("Nenhuma compra nesta fatura")
│  │  └─ items: PurchaseRow
│  │     ├─ Ícone de categoria (ShoppingBag default)
│  │     ├─ Descrição, data, valor
│  │     ├─ Badge de parcela "2/12" (se installment)
│  │     ├─ Badge de recorrência RefreshCw (se recurring)
│  │     └─ onTap → nada (sem edição V1)
│  └─ (sem exclusão de compra na V1 — travado pelo planner)
│
└─ Sheets (condicionais, fora da árvore de views)
   ├─ PurchaseSheet (mode="simple" | "installments")
   │  ├─ Campos: descrição, valor BRL, data, categoria, parcelas (1-48)
   │  ├─ Preview de parcelas (se N > 1): valor mensal + N meses
   │  ├─ Validação Zod client + API
   │  └─ Idempotency-key estável (useRef)
   ├─ RecurringSheet
   │  ├─ Campos: descrição, valor BRL, frequência (mensal/trimestral/anual), início, fim (opcional), categoria
   │  └─ Preview: "R$ X a cada Y a partir de data"
   └─ PaySheet (inline no detail, não sheet separado — ver REQ-C10)
```

### Reuso de infra V1

| Componente | Local | Reuso em Cartões |
|---|---|---|
| `Sheet` | `src/components/ui/Sheet.tsx` | PurchaseSheet, InstallmentSheet, RecurringSheet |
| `getAccountIcon` | `src/lib/ui/account-icon.tsx` | Ícone `CreditCard` indigo (branch já existe) |
| `formatBRL` | `src/lib/api/types.ts` | Todos os valores monetários |
| `getErrorMessage` | `src/lib/get-error-message.ts` | Mensagens PT-BR em erros de API |
| `apiGet`/`apiPost` | `src/lib/api/client.ts` | Chamadas autenticadas com `X-Device-Token` |
| `cache.ts` | `src/lib/cache.ts` | `placeholderData` offline para queries |
| `useNetworkStatus` | `src/lib/use-network-status.ts` | `online` prop para desabilitar writes |
| `amount.ts` | `src/lib/forms/amount.ts` | Parser BRL → cents |
| `schemas.ts` | `src/lib/forms/schemas.ts` | Base Zod schemas, estendidos para cartão |

## Requirements (EARS)

| ID | Type | Requirement |
|---|---|---|
| REQ-C1 | state-driven | A tab Cartões deve exibir **todos os cartões de crédito** do household (`Account.kind === 'credit_card'`), cada um como card resumo com: nome, ícone `CreditCard` (indigo), barra de progresso `usado/limite`, dias de fechamento e vencimento, e valor usado vs limite formatado em BRL. |
| REQ-C2 | state-driven | A barra de progresso deve usar **3 cores por threshold**: `bg-accent` (teal) se uso ≤80%, `bg-amber-400` se >80% e ≤100%, `bg-red-400` se >100%. O cálculo de uso é `sum(statement.balance) / creditLimitCents` das faturas abertas/fechadas do cartão, com fallback client-side. |
| REQ-C3 | event-driven | Ao tocar em um cartão, a view deve transicionar para a **lista de faturas** daquele cartão (drill-down), com back button "Cartões" no topo. |
| REQ-C4 | state-driven | A lista de faturas deve ser ordenada por data de fechamento **DESC** (mais recente primeiro), exibindo: label do período (ex: "Jun/26" ou "Fechamento 15 jun"), **badge de status** colorido, total, valor pago e saldo restante. |
| REQ-C5 | state-driven | Badges de status de fatura usam cores consistentes: `open` = azul (`bg-blue-100 text-blue-700`), `closed` = âmbar (`bg-amber-100 text-amber-700`), `paid` = verde (`bg-green-100 text-green-700`), `partial` = teal (`bg-teal-100 text-teal-700`), `overdue` = vermelho (`bg-red-100 text-red-700`), `cancelled` = slate (`bg-slate-100 text-slate-500`). |
| REQ-C6 | event-driven | Ao tocar em uma fatura, a view deve transicionar para o **detalhe da fatura** (drill-down), com back button com o período da fatura no topo. |
| REQ-C7 | state-driven | O detalhe da fatura deve exibir, no **header**: período, status badge, total da fatura, valor já pago, e valor restante (total − pago). Abaixo, a **seção de pagamento** com chips de atalho e a **lista de compras** da fatura. |
| REQ-C8 | state-driven | A lista de compras do detalhe deve exibir cada compra com: ícone de categoria (padrão `ShoppingBag`), descrição, data (`dd MMM`), valor em BRL com cor de despesa. Compras parceladas devem mostrar badge `"N/M"` (ex: "3/12"). Compras de recorrência devem mostrar badge `RefreshCw`. |
| REQ-C9 | event-driven | **"Nova compra"** (FAB ou botão no topo da lista de cartões) deve abrir bottom sheet com campos: descrição (texto), valor (BRL), data (date, default hoje), categoria (select), parcelas (number, default 1, min 1, max 48). |
| REQ-C10 | state-driven | Se parcelas = 1, usa `create_card_purchase`. Se parcelas > 1, o sheet deve exibir **preview**: valor da parcela (`total / N`) + lista dos N meses com data estimada (primeira parcela = data da compra, demais = mesmo dia nos meses seguintes), e usa `create_card_installments`. |
| REQ-C11 | state-driven | O preview de parcelas no sheet é **informativo** (não editável). O valor da parcela é arredondado para o centavo mais próximo; a diferença de arredondamento é absorvida pela última parcela (responsabilidade da API). |
| REQ-C12 | event-driven | **"Nova recorrência"** (botão no topo da lista de cartões) deve abrir bottom sheet com campos: descrição, valor (BRL), frequência (select: mensal / trimestral / anual), data de início (date, default hoje), data de fim (date, opcional), categoria (select). |
| REQ-C13 | state-driven | O sheet de recorrência deve mostrar preview: "R$ X a cada [mês/3 meses/ano] a partir de dd/mm/aaaa" (ou "até dd/mm/aaaa" se data fim preenchida). Ao submeter, chama `create_recurring_purchase`. |
| REQ-C14 | state-driven | A seção de pagamento no detalhe da fatura deve exibir **4 chips de atalho** lado a lado: **25%**, **50%**, **75%**, **100%** do valor restante da fatura. Abaixo, um campo "Outro valor" (BRL, editável) e um selector de conta origem. |
| REQ-C15 | event-driven | Ao tocar em um chip de atalho, o campo "Outro valor" deve ser preenchido com o valor calculado (ex: restante = R$ 1.000 → chip 50% preenche "R$ 500,00"). Tocar no mesmo chip novamente limpa o campo (toggle). |
| REQ-C16 | state-driven | O selector de conta origem para pagamento deve **filtrar `kind !== 'credit_card'`**, exibindo apenas contas bancárias e cash. Se não houver conta não-cartão, mostrar mensagem "Nenhuma conta disponível para pagamento" e desabilitar o botão Pagar. |
| REQ-C17 | event-driven | Ao submeter pagamento, chamar `pay_statement(statementId, amountCents, fromAccountId)`. Em sucesso: invalidar queries de statements, detail, dashboard e accounts. Em erro: manter sheet/dados, mostrar mensagem PT-BR, botão vira "Tentar novamente" reusando idempotency-key. |
| REQ-C18 | state-driven | Após pagamento total (`amountCents >= remaining`), o status da fatura deve refletir `paid`. Após pagamento parcial, deve refletir `partial`. A API é responsável por atualizar o status; o PWA invalida queries para refetch. |
| REQ-C19 | state-driven | **Offline**: lista de cartões e faturas exibem dados cacheados (`placeholderData`). Os botões de ação (Nova compra, Nova recorrência, Pagar) devem ficar `disabled` quando `online === false`. Nenhuma escrita offline é permitida. |
| REQ-C20 | state-driven | **Empty states**: (a) sem cartões → ícone `CreditCard` size 40 `text-slate-300` + "Nenhum cartão cadastrado" + "Cadastre um cartão pelo WhatsApp para começar."; (b) sem faturas → "Nenhuma fatura para este cartão"; (c) fatura sem compras → `Sparkles` size 24 `text-slate-300` + "Nenhuma compra nesta fatura". |
| REQ-C21 | state-driven | **Loading states**: cards → 3 skeleton cards com `animate-pulse` (altura ~100px cada); statements → 3 skeleton rows; detail → 1 skeleton header + 5 skeleton purchase rows. |
| REQ-C22 | state-driven | **Navegação**: ao entrar na tab Cartões, view default = `cards`. Ao selecionar um cartão, transição para `statements` com animação slide-from-right. Ao selecionar uma fatura, transição para `detail`. Back button retorna ao nível anterior. O estado de navegação é local (`useState`), não persiste em URL. |
| REQ-C23 | state-driven | Botão **"Nova compra"** e **"Nova recorrência"** devem estar visíveis apenas na view `cards` (não nas views aninhadas). Na view `cards`, ficam no topo como 2 botões lado a lado (`grid grid-cols-2 gap-2.5`), similar ao padrão de quick actions da Home. |
| REQ-C24 | state-driven | O **header da view statements** deve mostrar: ícone do cartão, nome do cartão, e um resumo compacto "R$ X usado de R$ Y" em uma linha abaixo. |
| REQ-C25 | unwanted | **V1 não permite**: (a) editar compra já registrada na fatura; (b) excluir compra da fatura; (c) cancelar recorrência; (d) editar dados do cartão (limite, dia de fechamento, vencimento) — criação/edição de cartão segue via WhatsApp ou Carteira. |
| REQ-C26 | unwanted | **V1 não permite** pagamento via outro cartão de crédito — o selector de conta origem filtra `kind === 'credit_card'`. |
| REQ-C27 | state-driven | Idempotency-key para criações (compra, parcelamento, recorrência, pagamento) deve ser **estável por submissão** via `useRef(crypto.randomUUID())` no sheet, reusada no retry, seguindo o padrão REQ-6/REQ-R19 do V1. |
| REQ-C28 | state-driven | Mensagens de erro da API devem ser exibidas em **PT-BR** no rodapé do sheet ativo, sem fechar o sheet. O input do usuário deve ser preservado (RHF mantém estado). Segue padrão REQ-10/REQ-R18 do V1. |

## Data / API Matrix

### Endpoints utilizados

| UI Action | API Tool | Params | Response |
|---|---|---|---|
| Listar cartões | `list_accounts` (filtro client-side `kind=credit_card`) ou query local com `useAccounts` | `householdId` (derivado do token) | `Account[]` (filtrado) |
| Listar faturas | `list_statements` | `accountId`, opcional `status`, `overdueOnly`, `limit` | `Statement[]` |
| Detalhe da fatura | `get_statement_details` | `statementId` | `StatementDetail { total, paid, balance, purchases[] }` |
| Criar compra avulsa | `create_card_purchase` | `accountId, description, amountCents, date, categoryId?` | `Transaction` |
| Criar compra parcelada | `create_card_installments` | `accountId, description, totalAmountCents, purchaseDate, installmentsTotal, categoryId?` | N `Transaction[]` (uma por parcela) |
| Criar recorrência | `create_recurring_purchase` | `accountId, description, amountCents, frequency, startDate, endDate?, categoryId?` | `RecurringPurchase` |
| Pagar fatura | `pay_statement` | `statementId, amountCents, fromAccountId` | `PaymentResult` |
| (opcional) Verificar limites | `check_card_limits` | `accountId?`, `date?` | `CardLimit[]` com % de uso e alertas |
| (opcional) Insights de cartão | `card_insights` | `yearMonth?`, `insightType?` | `CardInsight[]` |
| (opcional) Refresh automático | `refresh_statements` | `date?` | Mudanças de status |

### Tipos TypeScript (extensões em `src/lib/api/types.ts`)

```ts
export interface CreditCardAccount extends Account {
  kind: 'credit_card';
  creditLimitCents: number;
  closingDay: number;
  dueDay: number;
}

export interface Statement {
  id: string;
  accountId: string;
  periodLabel: string;       // ex: "Jun/26" ou "06/2026"
  closingDate: string;        // YYYY-MM-DD
  dueDate: string;            // YYYY-MM-DD
  totalCents: number;
  paidCents: number;
  balanceCents: number;
  status: 'open' | 'closed' | 'paid' | 'partial' | 'overdue' | 'cancelled';
}

export interface StatementDetail extends Statement {
  purchases: StatementPurchase[];
}

export interface StatementPurchase {
  id: string;
  description: string;
  amountCents: number;
  date: string;
  categoryName?: string;
  installmentNumber?: number;   // 1-based, presente se parcelada
  installmentsTotal?: number;   // presente se parcelada
  isRecurring?: boolean;
}

export interface RecurringPurchase {
  id: string;
  accountId: string;
  description: string;
  amountCents: number;
  frequency: 'monthly' | 'quarterly' | 'yearly';
  startDate: string;
  endDate?: string;
  categoryId?: string;
  status: 'active' | 'paused' | 'cancelled';
}
```

### Novas funções em `src/lib/api/finance-api.ts`

```ts
export function getStatements(token: string, accountId: string, filters?: { status?: string; limit?: number }) { /* GET /cards/:accountId/statements */ }
export function getStatementDetail(token: string, statementId: string) { /* GET /cards/statements/:id */ }
export function createCardPurchase(token: string, body: { accountId: string; description: string; amountCents: number; date: string; categoryId?: string }, idemKey?: string) { /* POST /cards/purchases */ }
export function createCardInstallments(token: string, body: { accountId: string; description: string; totalAmountCents: number; purchaseDate: string; installmentsTotal: number; categoryId?: string }, idemKey?: string) { /* POST /cards/installments */ }
export function createRecurringPurchase(token: string, body: { accountId: string; description: string; amountCents: number; frequency: string; startDate: string; endDate?: string; categoryId?: string }, idemKey?: string) { /* POST /cards/recurring */ }
export function payStatement(token: string, statementId: string, body: { amountCents: number; fromAccountId: string }, idemKey?: string) { /* POST /cards/statements/:id/pay */ }
```

## UX Flows / States

### Flow 1: Visualizar cartões e faturas

```
Tab "Cartões" → CardsPage (view='cards')
  │
  ├─ [loading]  → 3 skeleton cards com pulse
  ├─ [error]    → "Não foi possível carregar seus cartões." + botão "Tentar novamente"
  ├─ [empty]    → CreditCard icon + "Nenhum cartão cadastrado" + hint WhatsApp
  └─ [data]     → N CardSummaryCard
       │
       └─ [tap card] → view='statements'
            │
            ├─ [loading]  → 3 skeleton rows
            ├─ [error]    → "Não foi possível carregar as faturas." + botão "Tentar novamente"
            ├─ [empty]    → "Nenhuma fatura para este cartão"
            └─ [data]     → N StatementRow (ordenado DESC)
                 │
                 └─ [tap statement] → view='detail'
                      │
                      ├─ [loading]  → 1 skeleton header + 5 skeleton purchase rows
                      ├─ [error]    → "Não foi possível carregar os detalhes." + "Tentar novamente"
                      └─ [data]     → header + payment section + purchases list
```

### Flow 2: Criar compra (simples ou parcelada)

```
CardsPage (view='cards')
  └─ [tap "Nova compra"] → PurchaseSheet (mode="simple")
       │
       ├─ Preenche campos (RHF + Zod)
       ├─ Se parcelas > 1 → preview de parcelas aparece dinamicamente
       ├─ [submit] → useCreateCardPurchase ou useCreateCardInstallments
       │    ├─ [success] → sheet fecha, queries invalidadas, toast implícito (lista atualiza)
       │    └─ [error]   → mensagem PT-BR no rodapé, botão "Tentar novamente", sheet aberto
       └─ [backdrop click / X] → sheet fecha, estado perdido (sem confirmação)
```

### Flow 3: Pagar fatura (total ou parcial)

```
CardsPage (view='detail')
  └─ Seção "Pagamento"
       ├─ Chips: [25%] [50%] [75%] [100%]
       │    └─ [tap chip] → preenche campo "Outro valor" com valor calculado
       ├─ Campo "Outro valor" (BRL, editável)
       ├─ Selector conta origem (filtrado)
       └─ Botão "Pagar" (disabled se !online || !valor || !conta)
            │
            └─ [tap] → usePayStatement
                 ├─ [success] → queries invalidadas, fatura reflete novo status
                 └─ [error]   → mensagem PT-BR, botão "Tentar novamente"
```

### Flow 4: Criar recorrência

```
CardsPage (view='cards')
  └─ [tap "Nova recorrência"] → RecurringSheet
       │
       ├─ Preenche campos (RHF + Zod)
       ├─ Preview dinâmico: "R$ X a cada [freq] a partir de [data]"
       ├─ [submit] → useCreateRecurring
       │    ├─ [success] → sheet fecha
       │    └─ [error]   → mensagem PT-BR + retry
       └─ [backdrop / X] → fecha sem salvar
```

### State machine da navegação interna

```
states: cards → statements → detail
transitions:
  cards → statements  : onTap(card)
  statements → detail  : onTap(statement)
  statements → cards   : back button
  detail → statements  : back button
  detail → cards       : back button (não há atalho direto — dois taps no back)
```

## Error & Offline Behavior

### Erros de API (write)

| Ação | Comportamento |
|---|---|
| Compra / Parcelamento / Recorrência / Pagamento | Sheet permanece aberto. Mensagem PT-BR no rodapé (`getErrorMessage`). Botão submit vira "Tentar novamente". Idempotency-key reusada. Input preservado (RHF). |
| Network error (fetch fail) | Mesmo comportamento acima. Mensagem: "Sem conexão. Verifique sua internet e tente novamente." |
| Erro de validação (API retorna 422) | Campos inválidos destacados com mensagens da API. Sheet aberto. |
| Token expirado (401) | `resetLocalSession()` → `AuthGate` reaparece (comportamento existente do V1). |

### Erros de API (read)

| Ação | Comportamento |
|---|---|
| Falha ao carregar cartões | Mensagem PT-BR centralizada + botão "Tentar novamente" (refetch). |
| Falha ao carregar faturas | Mensagem PT-BR + "Tentar novamente". Back button disponível. |
| Falha ao carregar detalhe | Mensagem PT-BR + "Tentar novamente". Back button disponível. |

### Offline

| Componente | Comportamento |
|---|---|
| CardSummaryCard (lista) | Dados cacheados visíveis (`placeholderData`). Barra de progresso funcional. |
| StatementRow (lista) | Dados cacheados visíveis. Status badge visível. |
| StatementDetail | Dados cacheados visíveis. Seção de pagamento **inteira desabilitada**. |
| Botões "Nova compra" / "Nova recorrência" | `disabled` (aparecem visualmente atenuados). |
| Chips de pagamento + campo "Outro valor" | `disabled`. |
| Selector de conta origem | `disabled`. |
| Botão "Pagar" | `disabled`. |
| OfflineBanner | Exibido no topo (componente global existente). |

## Testing Strategy

| Layer | Tool | Scope |
|---|---|---|
| Unit | Vitest | Validadores Zod (schemas de compra, parcelamento, recorrência, pagamento), conversão BRL→cents (`amount.ts`), helpers de cálculo (valor da parcela, preview de meses, thresholds de limite) |
| Component | Vitest + Testing Library | `CardSummaryCard`: render com dados mockados, progress bar color thresholds, empty/loading states. `StatementRow`: status badge colors, valores formatados. `cards-rows.test.tsx`: drill-down navigation state. `card-sheets.test.tsx`: PurchaseSheet (validação bloqueia submit vazio, BRL→cents, preview de parcelas, retry em erro, idempotency-key estável), RecurringSheet (preview dinâmico), PaySheet (atalhos 25/50/75/100 preenchem campo, toggle, filtro de conta origem) |
| Integration | Vitest + MSW | Hooks (`useStatements`, `usePayStatement`, etc.) com mock da API, valida cache hit/miss, invalidação pós-mutation |
| E2E | Playwright | Fluxo completo: abrir tab Cartões → ver cartão → abrir faturas → abrir detalhe → pagar com atalho 50% → voltar → criar compra parcelada → ver parcela na fatura |
| Contract | Zod schema tests | Paridade request/response com API de cartão (`create_card_purchase`, `pay_statement`, etc.) |
| PWA | Playwright + Lighthouse | Service worker ativo na tab Cartões, cache offline para queries de cartão |

**Feature test protocol (RED-first):**
1. Unit RED: validators, helpers, preview logic.
2. Component RED: sheets com RHF (validação, preview, retry, atalhos).
3. Integration: hooks com MSW.
4. E2E: Playwright com `page.route()` mock da API de cartão.
5. Coverage ratchet: ≥80% lines no novo código (`src/features/cards/`, `src/lib/api/` extensões).

## Milestones / Implementation Order

| # | Slice | Escopo | Entregável |
|---|---|---|---|
| C-1 | Tipos + API client | Estender `types.ts` com `Statement`, `StatementDetail`, `StatementPurchase`, `RecurringPurchase`. Adicionar funções em `finance-api.ts`: `getStatements`, `getStatementDetail`, `createCardPurchase`, `createCardInstallments`, `createRecurringPurchase`, `payStatement`. Schemas Zod em `schemas.ts`. | `src/lib/api/types.ts`, `src/lib/api/finance-api.ts`, `src/lib/forms/schemas.ts` |
| C-2 | Queries + mutations | Hooks TanStack Query: `useStatements`, `useStatementDetail`, `useCreateCardPurchase`, `useCreateCardInstallments`, `useCreateRecurring`, `usePayStatement`. Cache + invalidação. | `src/lib/api/queries.ts`, `src/lib/api/mutations.ts` |
| C-3 | CardsPage — lista de cartões + navegação | Estrutura da página com 3 views (`cards`, `statements`, `detail`), navegação drill-down com back button, `CardSummaryCard` com barra de progresso e thresholds. Estados loading/error/empty. | `src/features/cards/CardsPage.tsx` (view cards + navegação) |
| C-4 | CardsPage — faturas + detalhe | View `statements` com `StatementRow`, view `detail` com header, lista de compras `PurchaseRow`, badges de parcela e recorrência. Estados loading/error/empty. | `src/features/cards/CardsPage.tsx` (completo) |
| C-5 | PurchaseSheet + InstallmentSheet | Sheet de compra avulsa e parcelada, preview de parcelas, validação Zod, idempotency-key, retry. | `src/features/cards/card-sheets.tsx` (PurchaseSheet) |
| C-6 | RecurringSheet | Sheet de recorrência com preview dinâmico, validação, idempotency-key. | `src/features/cards/card-sheets.tsx` (RecurringSheet) |
| C-7 | Seção de pagamento + PaySheet | Chips 25/50/75/100, campo custom, selector conta origem (filtrado), submit com retry. | Integrado no `CardsPage.tsx` (detail view) |
| C-8 | Tab "Cartões" no App | Adicionar 4ª tab `Cartões` no `App.tsx`, ícone `CreditCard`, lazy loading, code-splitting. | `src/App.tsx` |
| C-9 | Testes unitários + componente | Vitest: schemas, helpers, sheets, rows. Coverage ≥80%. | `card-sheets.test.tsx`, `cards-rows.test.tsx` |
| C-10 | E2E Playwright | Fluxo completo com `page.route()` mock da API de cartão. | `e2e/cards.spec.ts` |

**Ordem de dependência:** C-1 → C-2 → C-3 → C-4 → C-5 → C-6 → C-7 → C-8 → C-9 → C-10.

## Non-goals (V1)

- Sem edição de compra já registrada na fatura.
- Sem exclusão de compra da fatura.
- Sem cancelamento ou edição de recorrência existente.
- Sem criação/edição de cartão pela UI do PWA (segue via WhatsApp ou Carteira; o PWA só lista cartões existentes).
- Sem bulk actions (pagar múltiplas faturas de uma vez).
- Sem notificações push de fechamento/vencimento de fatura (Notification API pós-V1).
- Sem parcelamento de fatura (crédito rotativo).
- Sem antecipação de parcelas.
- Sem exportação de fatura (PDF/CSV).
- Sem split de conta (dividir fatura com outra pessoa).
- Sem suporte a múltiplos households.
- Sem escrita offline.
- Sem gráficos de gastos por cartão na V1 (`card_insights` como stretch opcional).
