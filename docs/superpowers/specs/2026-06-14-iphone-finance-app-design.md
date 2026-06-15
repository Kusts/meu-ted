# iPhone Finance App Design

## Context

- WhatsApp remains conversational interface with TED/Agent Pi.
- iPhone app becomes visual cockpit over existing financial data.
- App complements Agent Pi: dashboard, CRUD, filters, charts, insights.
- `apps/whatsapp-bridge` stays transport-only and is not app backend.
- Initial users: user + wife, one household, future SaaS not in scope.

## Decisions

| Decision | Choice | Reason | Rejected |
|---|---|---|---|
| Mobile stack | SwiftUI native | best iPhone UX, premium feel | React Native, PWA |
| Access | Internet via Cloudflare Tunnel | HTTPS without router port exposure | local-only, public port |
| Auth v1 | authorized devices + Face ID/PIN + device token | simple personal security | account/password |
| Backend | new private REST API service, separate from `apps/whatsapp-bridge`, over shared finance service | predictable app contracts without duplicating Agent Pi invariants or bloating bridge | Pi RPC direct, GraphQL |
| Sync | online CRUD + read-only cache | useful offline, no conflict engine | offline writes |
| Scope | one household | personal use now | multi-tenant SaaS |

## Architecture

```txt
iPhone SwiftUI
  ├─ Face ID/PIN gate
  ├─ local encrypted token
  ├─ read-only cache
  └─ HTTPS REST JSON
        ↓
Cloudflare Tunnel
        ↓
private finance API service
  ├─ separate from apps/whatsapp-bridge
  ├─ device auth
  ├─ accounts
  ├─ categories
  ├─ transactions
  ├─ transfers
  ├─ dashboard
  └─ insights
        ↓
shared finance service
  ├─ same invariants as Agent Pi tools
  └─ persistence adapter
        ↓
Postgres financeiro
        ↑
Agent Pi tools / WhatsApp
```

Boundary rules:
- The WhatsApp bridge shall remain transport-only.
- The iPhone app shall not call Evolution/WhatsApp bridge endpoints.
- The finance API shall be separate from `apps/whatsapp-bridge` and shall not add domain logic to the WhatsApp bridge.
- The finance API shall expose app CRUD validation and response contracts.
- The finance API shall enforce the same invariants as Agent Pi tools before persistence.
- Agent Pi shall remain conversational brain for WhatsApp and advice generation.
- App and Agent Pi shall share the same financial database truth.

## Requirements

| ID | Type | Requirement |
|---|---|---|
| REQ-1 | ubiquitous | The app shall provide visual access to accounts, categories, transactions, transfers, dashboard data, and insights for one household. |
| REQ-2 | event-driven | When user opens app, the app shall require Face ID or device PIN before showing financial data. |
| REQ-3 | state-driven | While device token is missing, revoked, or invalid, the API shall reject every finance endpoint. |
| REQ-3A | state-driven | While using V1, the API shall derive exactly one household from the device token and shall ignore client-supplied household IDs. |
| REQ-4 | event-driven | When user creates expense, income, or transfer, the API shall validate amount, date, account, category, and ownership within the household derived from the device token before saving. |
| REQ-5 | state-driven | While offline, the app shall show cached dashboards and lists as read-only. |
| REQ-6 | unwanted | If app loses internet during CRUD, then the app shall keep form data and show retry, without creating duplicate records. |
| REQ-7 | ubiquitous | The app shall support filters by date, account, category, type, value range, and text search. |
| REQ-8 | ubiquitous | The app shall show TED-style insights, rankings, anomalies, trends, and financial advice without exposing logs or raw JSON. |
| REQ-9 | state-driven | While a module is not implemented, the app shall hide its create/edit entry points instead of showing fake stubs. |
| REQ-10 | unwanted | If API validation fails, then the app shall show a human-readable PT-BR message and keep user input. |

## Modules

| Order | Module | Scope |
|---|---|---|
| 1 | Base financeira | bank accounts, categories, incomes, expenses, transfers, transaction CRUD, filters, dashboard basic |
| 2 | Dashboard | full expansion: balance, current month, cash flow, rankings, alerts, quick TED insights |
| 3 | Lançamentos | grouped list, search, advanced filters, detail, create, edit, delete |
| 4 | Carteira | bank accounts CRUD, categories CRUD, transfers, account balances |
| 5 | Insights | spending analysis, rankings, anomalies, income share, trends, TED advice |
| 6 | Cartões | cards, statements, purchases, installments, limits, statement payment |
| 7 | Contas a pagar | one-time bills, recurring bills, due reminders, overdue status |
| 8 | Orçamentos | category budgets, progress, alerts, suggested adjustments |
| 9 | Metas | goals, contributions, progress, emergency/debt/purchase targets |
| 10 | Parcelamentos | out-of-card plans, due installments, prepayment simulation, score |
| 11 | Relatórios | advanced filters, export, month comparisons, category ranking |

Rule: each full module shall include list, detail, create, edit, delete when applicable, filters, and local insights.

## Navigation

Target-state navigation:

```txt
Tab bar
├─ Início        # dashboard, alerts, TED insights
├─ Registros     # list, search, filters, CRUD
├─ Planejamento  # payables, budgets, goals, installments
├─ Carteira      # bank accounts, cards, transfers, categories
└─ Insights      # analysis, rankings, trends, advice

Global +
├─ despesa
├─ receita
└─ transferência

After card module ships, Global + adds:
└─ compra no cartão
```

V1 navigation:

```txt
Tab bar
├─ Início
├─ Registros
└─ Carteira

Global +
├─ despesa
├─ receita
└─ transferência
```

## Visual Direction

| Reference | Use |
|---|---|
| Copilot Money | financial cards, charts, categories, modern consumer finance feel |
| Monarch Money | planning, goals, budgeting, family finance clarity |
| Mercury | premium trust, calm finance tone, excellent spacing |
| Linear | speed, density, crisp interactions |

Design traits:
- premium financial app, not generic admin;
- dense cards with clear hierarchy;
- numbers as first-class content;
- quick filters near lists;
- charts readable on small screens;
- TED insights short, useful, friendly;
- 4px spacing grid;
- light mode first, dark mode after v1 unless implementation cost is low.

## V1 Scope

V1 = Base financeira + dashboard básico.

V1 visible tabs: Início, Registros, Carteira.
V1 hidden until implemented: Planejamento, Insights, full Cartões.
V1 Carteira shows bank/cash accounts only; credit-card accounts appear after module 2.

### Screens

```txt
Início
├─ saldo total
├─ receita/despesa do mês
├─ fluxo últimos 30 dias
├─ top despesas
└─ TED insights rápidos

Registros
├─ lista agrupada por data
├─ busca
├─ filtros avançados
├─ detalhe
└─ editar/excluir

Carteira
├─ contas bancárias CRUD
├─ categorias CRUD
└─ transferências

+
├─ despesa
├─ receita
└─ transferência
```

### V1 private finance API endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/auth/devices/register` | register or request device authorization |
| GET | `/auth/devices/me` | validate current device token |
| GET | `/accounts` | list bank accounts |
| POST | `/accounts` | create bank account |
| PATCH | `/accounts/{id}` | update account name/status |
| POST | `/accounts/{id}/deactivate` | soft-deactivate account when allowed by invariants |
| GET | `/categories` | list categories by kind |
| POST | `/categories` | create category |
| PATCH | `/categories/{id}` | update category |
| POST | `/categories/{id}/deactivate` | soft-deactivate category when allowed by invariants |
| GET | `/transactions` | list expenses/incomes/transfers with filters |
| POST | `/transactions/expense` | create expense |
| POST | `/transactions/income` | create income |
| POST | `/transfers` | create transfer |
| PATCH | `/transactions/{id}` | update expense/income fields; transfer updates are limited to description/date unless service invariants allow more |
| DELETE | `/transactions/{id}` | soft-delete expense/income/transfer transaction |
| GET | `/dashboard/summary` | totals, balances, rankings, cash flow |
| GET | `/insights/quick` | quick advice cards for home screen |

## Data Contracts

```ts
type MoneyCents = number;
type ISODate = `${number}-${number}-${number}`;

type Account = {
  id: string;
  name: string;
  // V1 list filters out credit_card; module 2 exposes card accounts.
  kind: "bank" | "cash" | "credit_card";
  balanceCents: MoneyCents;
  status: "active" | "inactive";
};

type Category = {
  id: string;
  name: string;
  kind: "expense" | "income";
  status: "active" | "inactive";
};

type Transaction = {
  id: string;
  // Transfers are returned by /transactions with kind="transfer".
  // Creation uses /transfers; deletion uses /transactions/{id} soft-delete.
  kind: "expense" | "income" | "transfer";
  description: string;
  amountCents: MoneyCents;
  date: ISODate;
  accountId: string;
  categoryId?: string;
  transferToAccountId?: string;
};

type TransactionFilters = {
  startDate?: ISODate;
  endDate?: ISODate;
  accountId?: string;
  categoryId?: string;
  kind?: "expense" | "income" | "transfer";
  minAmountCents?: MoneyCents;
  maxAmountCents?: MoneyCents;
  query?: string;
};
```

## Security

- App shall store token in Keychain.
- App shall lock behind Face ID/PIN after cold start and inactivity timeout.
- API shall require device token on all finance endpoints.
- API shall bind each device token to exactly one V1 household and derive household server-side.
- API shall support manual device revocation.
- API shall log request IDs and status only, not raw financial payloads.
- Tunnel shall provide HTTPS; API shall still validate auth itself.
- Deletion shall be soft-delete for auditability.

## Future Parity and Cross-cutting Modules

Existing Agent Pi tool inventory indicates these app surfaces should be planned after V1:

| Area | App surface |
|---|---|
| Notifications | overdue reminders, due today, upcoming, daily/weekly summaries, card closing, limit alerts |
| Card statements | open/closed/paid/overdue faturas, statement detail, payment, card limit health |
| Audit/history | audit log, source message trace, deleted/updated record history |
| Undo | undo recent create/update/delete where tool permits |
| Advanced insights | spending anomalies, income share, payment score, installment score, card insights |
| Templates | recurring payable templates, auto-create from templates |
| Price alerts | recurring bill price changes versus historical average |

These modules shall reuse the same shared finance service invariants and shall not reimplement divergent app-only rules.

## Testing Strategy

| Layer | Tool | Scope |
|---|---|---|
| API unit | Vitest | validators, filters, totals, auth guards |
| API contract | Zod + route tests | request/response schemas |
| API integration | test Postgres or transaction rollback | CRUD + soft delete + filters |
| Swift unit | XCTest | view models, formatters, filters, cache policy |
| Swift snapshot | iOS snapshot tests | dashboard/cards/forms once UI exists |
| Swift UI | XCUITest | login gate, list filters, create/edit flows |
| Security | focused tests | revoked token, missing token, invalid device |
| Mutation | Stryker or equivalent for API | validators and money calculations |

Feature test protocol:
- Unit RED first: every API validator and money calculation.
- Snapshot: yes for SwiftUI screens after design tokens exist.
- Contract: yes for every REST endpoint with Zod schemas.
- E2E: opt-in after V1 vertical slice is stable.
- Mutation: target API validators, auth guard, totals.
- Coverage ratchet: at least 80% on new API code.

## Non-goals V1

- No WhatsApp replacement.
- No multi-tenant SaaS.
- No public App Store launch.
- No offline write sync.
- No bridge financial domain logic.
- No card module UI or persistence before full card module implementation.
- No account/password auth.
