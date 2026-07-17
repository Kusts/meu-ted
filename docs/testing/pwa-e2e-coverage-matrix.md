# PWA E2E Coverage Matrix

Legend: **M** functional-mobile, **D** functional-desktop, **P** pwa-runtime. Every row has seeded auth unless noted. API assertions use the fixture server request journal.

| Surface / route | Project | Seed/state | Interaction | Expected UI + API/state | Negative case | Owning spec |
|---|---|---|---|---|---|---|
| Auth `/` | M,D | no token | Register device | app shell; `POST /auth/devices/register`; token stored | 422/network shows error | `auth.spec.ts` |
| Auth expiry | M | expired token | bootstrap | registration prompt; storage/snapshot cleared | 401 only | `auth.spec.ts` |
| Shell all routes | M | seeded | direct load all 13 routes | title/content + no browser failures | 500 domain shows degraded banner | `navigation.spec.ts` |
| Bottom nav | M,D | seeded | Resumo, Registros, A pagar, Mais | client route/sheet transition; no chunk request error | stale chunk/cache migration | `navigation.spec.ts`, `pwa-runtime.spec.ts` |
| More grid | M | seeded | Patrimônio, Contas, Cartões, Assinaturas, Orçamentos, Metas, Categorias, Relatórios | each route opens through actual button | close sheet/cancel remains current route | `navigation.spec.ts` |
| FAB / transaction sheet | M,D | accounts/categories | expense, income, transfer tabs; calendar; selectors; add inline category/account/card; installments | correct POST/write and list/card state changes | required fields, amount bounds, cancel | `transaction-sheet.spec.ts` |
| Home `/` | M,D | populated | profile, notifications, expense/income/transfer quick actions, account/card/payable cards | correct route/sheet and data | empty/degraded | `home.spec.ts` |
| Records `/registros` | M | populated | search, period, category filter, row action/edit/delete | `PATCH`/`DELETE /transactions`; list updates | cancel/invalid amount/API 500 | `records.spec.ts` |
| Accounts `/contas` | M | bank/cash/card | create bank/cash/card, open card, edit, deactivate | account/card endpoint + card state | required fields/deactivate failure | `accounts.spec.ts` |
| Categories `/categorias` | M | categories/subcategories | create kind, add subcategory, edit, deactivate | category endpoint + hierarchy update | empty name/API error | `categories.spec.ts` |
| Payables `/a-pagar` | M,D | pending/paid | create, filters, detail edit, mark paid, undo, cancel | payable endpoint + badge/list update | invalid date/amount/API error | `payables.spec.ts` |
| Budgets `/orcamentos` | M | expense/income categories | tab, type chooser, category picker, create, detail edit | budget create/update + displayed amount | missing category/amount/API error | `budgets.spec.ts` |
| Goals/debts `/metas` | M | goal/debt | tabs, choose type, create, detail, edit, contribution, cancel | goal endpoint + progress/status | invalid target/API error | `goals.spec.ts` |
| Cards `/cartoes` | M,D | card/statements/purchases | create/edit card, select card/statement, pay full/partial, edit purchase | cards/statement/purchase endpoint + totals | missing payment account/API error | `cards.spec.ts` |
| Subscriptions `/assinaturas` | M | active/cancelled | tabs, create, detail, edit, cancel | subscription endpoint + list state | invalid amount/API error | `subscriptions.spec.ts` |
| Wallet `/patrimonio` | M,D | accounts/assets | cards/sections/details | display and navigation correctness | empty/degraded | `wallet.spec.ts` |
| Reports `/relatorios` | M,D | transactions | period chips | charts/summary change by period | empty state | `reports.spec.ts` |
| Profile `/perfil` | M | profile | profile edit/avatar/greeting, notifications, logout | profile endpoint/storage cleared; notification navigation/dismiss | validation/API error | `profile.spec.ts` |
| Shared sheets/dialogs | M | dirty form | close/back/confirm/cancel; stale/retry/write-error banners | dirty state preserved or confirmed, retry repeats request | dismiss/error boundary | `shared-ui.spec.ts` |
| PWA install/runtime | P | clean/dirty + legacy cache | register/reload, old `pi-finance-shell` migration, offline navigation, update | controller active; no route HTML/RSC cached; offline shell only | dirty retains waiting worker | `pwa-runtime.spec.ts` |
| Production smoke | opt-in | unauthenticated clean context | direct `/`, `/registros`, `/contas`, `/cartoes` | 200, styled shell, no CSP/chunk errors | no write/auth registration allowed | `production-smoke.spec.ts` |

## Explicit route inventory
`/`, `/registros`, `/a-pagar`, `/assinaturas`, `/cartoes`, `/categorias`, `/contas`, `/metas`, `/orcamentos`, `/patrimonio`, `/perfil`, `/relatorios`, plus static manifest and internal PWA control/observability contracts covered by dedicated Vitest/API tests.

## Matrix gate
A pull request cannot claim comprehensive E2E coverage if a new visible action lacks a row/spec owner. The suite reports matrix/spec names in CI output.
