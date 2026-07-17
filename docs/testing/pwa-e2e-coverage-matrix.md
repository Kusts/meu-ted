# PWA E2E Coverage Matrix

Every ID is atomic: one visible action, required state, expected UI/API effect, negative case and owner. **M** mobile, **D** desktop, **P** SW runtime. All functional rows use seeded auth and assert the fixture journal unless stated otherwise.

| ID | Route/surface | Project | Action → expected API/UI | Negative / state | Owner |
|---|---|---|---|---|---|
| AUTH-01 | `/` | M,D | Register device → `POST /auth/devices/register`, token, home | 422 and abort show error | auth |
| AUTH-02 | bootstrap | M | expired token → `/auth/devices/me` 401, clear storage | valid token unlocks | auth |
| NAV-01 | BottomNav | M,D | Resumo → `/` client navigation | no chunk/CSP error | navigation |
| NAV-02 | BottomNav | M,D | Registros → `/registros` client navigation | no chunk/CSP error | navigation |
| NAV-03 | BottomNav | M,D | A pagar → `/a-pagar` client navigation | no chunk/CSP error | navigation |
| NAV-04 | BottomNav | M | Mais opens/closes sheet | cancel preserves route | navigation |
| NAV-05 | More | M | Patrimônio → `/patrimonio` | direct load parity | navigation |
| NAV-06 | More | M | Contas → `/contas` | direct load parity | navigation |
| NAV-07 | More | M | Cartões → `/cartoes` | direct load parity | navigation |
| NAV-08 | More | M | Assinaturas → `/assinaturas` | direct load parity | navigation |
| NAV-09 | More | M | Orçamentos → `/orcamentos` | direct load parity | navigation |
| NAV-10 | More | M | Metas & Dívidas → `/metas` | direct load parity | navigation |
| NAV-11 | More | M | Categorias → `/categorias` | direct load parity | navigation |
| NAV-12 | More | M | Relatórios → `/relatorios` | direct load parity | navigation |
| TX-01 | FAB | M,D | open/close expense sheet | cancel no journal write | transaction-sheet |
| TX-02 | expense sheet | M | select date/category/account, save expense → `POST /transactions/expense` | required amount/category/account | transaction-sheet |
| TX-03 | income sheet | M | save income → `POST /transactions/income` | 422 preserves inputs | transaction-sheet |
| TX-04 | transfer sheet | M | select from/to, save → `POST /transfers` | same/missing account rejected | transaction-sheet |
| TX-05 | sheet inline | M | add category/subcategory/account/card | each correct create endpoint/state | blank name cancel | transaction-sheet |
| TX-06 | installments | M | select card/installments, save → `POST /cards/installments` | invalid count/422 | transaction-sheet |
| HOME-01 | `/` | M,D | profile button → `/perfil` | degraded profile | home |
| HOME-02 | `/` | M | notification sheet/open item/dismiss | journal/state update | empty notifications | home |
| HOME-03 | `/` | M | quick expense/income/transfer open correct tab | cancel safe | home |
| HOME-04 | `/` | M | account/card/payable cards navigate target | empty cards | home |
| REC-01 | `/registros` | M | search and period/category filters | empty result | records |
| REC-02 | `/registros` | M | row opens action/edit, save → `PATCH /transactions/:id` | invalid amount/500 | records |
| REC-03 | `/registros` | M | delete confirmation → `DELETE /transactions/:id` | cancel no mutation | records |
| ACC-01 | `/contas` | M | create bank/cash account → `POST /accounts` | invalid name/amount | accounts |
| ACC-02 | `/contas` | M | create credit card → `POST /cards` | invalid limit/days | accounts |
| ACC-03 | `/contas` | M | card/detail edit → `PATCH /accounts/:id` or card endpoint | 500 banner/retry | accounts |
| ACC-04 | `/contas` | M | deactivate confirmation | cancel/no mutation | accounts |
| CAT-01 | `/categorias` | M | create expense/income → `POST /categories` | blank/422 | categories |
| CAT-02 | `/categorias` | M | add subcategory, edit, deactivate | correct journal each | cancel/error | categories |
| PAY-01 | `/a-pagar` | M,D | create payable → `POST /payables` | invalid fields/422 | payables |
| PAY-02 | `/a-pagar` | M | status filters and detail edit → `PATCH /payables/:id` | cancel | payables |
| PAY-03 | `/a-pagar` | M | mark paid/undo/cancel | pay/cancel endpoints and badge | API 500 | payables |
| BUD-01 | `/orcamentos` | M | expense/income tabs/type/category picker | empty categories | budgets |
| BUD-02 | `/orcamentos` | M | create/update budget | correct endpoint/display | missing amount/category | budgets |
| GOAL-01 | `/metas` | M | goals/debts tabs and type chooser | empty state | goals |
| GOAL-02 | `/metas` | M | create/edit/contribute/cancel goal/debt | goal endpoint/progress | invalid target/500 | goals |
| CARD-01 | `/cartoes` | M,D | create/edit card | cards endpoint/visible limit | invalid fields | cards |
| CARD-02 | `/cartoes` | M | select card/statement/purchase and edit purchase | `PATCH /cards/purchases/:id` | 422 | cards |
| CARD-03 | `/cartoes` | M | full/partial payment | statement payment endpoint/totals | missing source account | cards |
| SUB-01 | `/assinaturas` | M | tabs/create subscription | create endpoint/list | invalid amount | subscriptions |
| SUB-02 | `/assinaturas` | M | detail/edit/cancel | update/cancel endpoint | cancel confirmation/error | subscriptions |
| WAL-01 | `/patrimonio` | M,D | cards/sections/details render | empty/degraded | wallet |
| REP-01 | `/relatorios` | M,D | each period chip updates summary/chart | empty transactions | reports |
| PROF-01 | `/perfil` | M | profile edit/avatar/greeting save | profile endpoint/422 | profile |
| PROF-02 | `/perfil` | M | notifications open/item/dismiss | navigation/state | empty | profile |
| PROF-03 | `/perfil` | M | logout clears token/snapshot → register | cancel where offered | profile |
| UI-01 | shared sheets | M | back/close/confirm/cancel dirty form behavior | preserve/confirm as applicable | shared-ui |
| UI-02 | banners | M | stale retry/dismiss and write-error retry/dismiss | retry journal | shared-ui |
| PWA-01 | SW | P | install/reload controller and offline shell fallback | network failure only | pwa-runtime |
| PWA-02 | SW migration | P | legacy `pi-finance-shell` removed; no HTML/RSC cached | old chunks never requested | pwa-runtime |
| PWA-03 | SW update | P | clean activates once; dirty retains waiting | null waiting safe | pwa-runtime |
| SMOKE-01 | production | opt-in | direct `/`, `/registros`, `/contas`, `/cartoes` styled/read-only | no auth/write | production-smoke |

## Contract-only coverage
`manifest.webmanifest`, `/pwa-control`, RUM route, not-found, headers and static assets remain dedicated Vitest/contract tests; they are not application pages.

## Matrix gate
A new visible action must add one action ID, expected fixture journal/UI assertion, negative behavior and owning spec before merge. No action ID may be unowned.
