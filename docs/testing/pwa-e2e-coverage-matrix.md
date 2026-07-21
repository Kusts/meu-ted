# PWA E2E Coverage Matrix

Every ID is atomic: one visible action, required state, expected UI/API effect, negative case and owner. **M** mobile, **D** desktop, **P** SW runtime. DIRECT rows validate direct-load rendering. SMOKE rows validate unauthenticated shell without registration. API-action rows assert the fixture journal; UI-only rows (render/navigation/non-write) assert absence of unexpected writes. All functional rows use seeded auth and assert the fixture journal unless stated otherwise.

| ID | Route/surface | Project | Action → expected API/UI | Negative / state | Owner |
|---|---|---|---|---|---|
| AUTH-01 | `/` | M,D | Register device → `POST /auth/devices/register`, token, home | 422 and abort show error | auth |
| AUTH-02 | bootstrap | M | expired token → `/auth/devices/me` 401, clear storage | valid token unlocks | auth |
| DIRECT-01 | `/` | M,D | direct load renders shell with styled nav | empty/404 | navigation |
| DIRECT-02 | `/registros` | M,D | direct load renders registros shell | empty | navigation |
| DIRECT-03 | `/a-pagar` | M,D | direct load renders payables shell | empty | navigation |
| DIRECT-04 | `/assinaturas` | M,D | direct load renders subscriptions shell | empty | navigation |
| DIRECT-05 | `/cartoes` | M,D | direct load renders cartoes shell | empty | navigation |
| DIRECT-06 | `/categorias` | M,D | direct load renders categorias shell | empty | navigation |
| DIRECT-07 | `/contas` | M,D | direct load renders contas shell | empty | navigation |
| DIRECT-08 | `/metas` | M,D | direct load renders metas shell | empty | navigation |
| DIRECT-09 | `/orcamentos` | M,D | direct load renders orcamentos shell | empty | navigation |
| DIRECT-10 | `/patrimonio` | M,D | direct load renders patrimonio shell | empty | navigation |
| DIRECT-11 | `/perfil` | M,D | direct load renders perfil shell | empty | navigation |
| DIRECT-12 | `/relatorios` | M,D | direct load renders relatorios shell | empty | navigation |
| NAV-01 | BottomNav | M,D | Resumo → `/` client navigation | no chunk/CSP error | navigation |
| NAV-02 | BottomNav | M,D | Registros → `/registros` client navigation | no chunk/CSP error | navigation |
| NAV-03 | BottomNav | M,D | A pagar → `/a-pagar` client navigation | no chunk/CSP error | navigation |
| NAV-04 | BottomNav | M | tap Mais opens bottom sheet | overlay accessible | navigation |
| NAV-05 | More | M | Patrimônio → `/patrimonio` | direct load parity | navigation |
| NAV-06 | More | M | Contas → `/contas` | direct load parity | navigation |
| NAV-07 | More | M | Cartões → `/cartoes` | direct load parity | navigation |
| NAV-08 | More | M | Assinaturas → `/assinaturas` | direct load parity | navigation |
| NAV-09 | More | M | Orçamentos → `/orcamentos` | direct load parity | navigation |
| NAV-10 | More | M | Metas & Dívidas → `/metas` | direct load parity | navigation |
| NAV-11 | More | M | Categorias → `/categorias` | direct load parity | navigation |
| NAV-12 | More | M | Relatórios → `/relatorios` | direct load parity | navigation |
| NAV-13 | BottomNav | M | tap overlay/backdrop closes Mais sheet | cancel preserves route | navigation |
| TX-01 | FAB | M,D | tap FAB opens expense sheet | no sheet visible | transaction-sheet |
| TX-02 | expense sheet | M | save expense → `POST /transactions/expense` | required amount/category/account | transaction-sheet |
| TX-03 | income sheet | M | save income → `POST /transactions/income` | 422 preserves inputs | transaction-sheet |
| TX-04 | transfer sheet | M | save transfer → `POST /transfers` | same/missing account rejected | transaction-sheet |
| TX-05 | sheet inline | M | add category inline → create endpoint | blank name cancel | transaction-sheet |
| TX-06 | sheet inline | M | add subcategory inline → create endpoint | blank name cancel | transaction-sheet |
| TX-07 | sheet inline | M | add account inline → create endpoint | blank name cancel | transaction-sheet |
| TX-08 | sheet inline | M | add card inline → create endpoint | blank name cancel | transaction-sheet |
| TX-09 | installments | M | save installments → `POST /cards/installments` | invalid count/422 | transaction-sheet |
| HOME-01 | `/` | M,D | profile button → `/perfil` | degraded profile | home |
| HOME-02 | `/` | M | tap notification bell → sheet opens | empty notifications | home |
| HOME-03 | `/` | M | tap quick expense → expense sheet opens | cancel safe | home |
| HOME-04 | `/` | M | account card navigates to `/contas` | empty cards | home |
| HOME-05 | `/` | M | card card navigates to `/cartoes` | empty cards | home |
| HOME-06 | `/` | M | payable card navigates to `/a-pagar` | empty cards | home |
| HOME-07 | `/` | M | tap notification item → navigates to target | empty notifications | home |
| HOME-08 | `/` | M | dismiss notification → notification removed | swipe fails | home |
| HOME-09 | `/` | M | tap quick income → income sheet opens | cancel safe | home |
| HOME-10 | `/` | M | tap quick transfer → transfer sheet opens | cancel safe | home |
| REC-01 | `/registros` | M | type in search bar → filtered results show | empty result | records |
| REC-02 | `/registros` | M | select period filter → filtered results show | empty result | records |
| REC-03 | `/registros` | M | select category filter → filtered results show | empty result | records |
| REC-04 | `/registros` | M | tap row opens action sheet with edit/delete | empty row | records |
| REC-05 | `/registros` | M | save edit → `PATCH /transactions/:id` | invalid amount/500 | records |
| REC-06 | `/registros` | M | confirm delete → `DELETE /transactions/:id` | cancel no mutation | records |
| ACC-01 | `/contas` | M | create bank account → `POST /accounts` | invalid name/amount | accounts |
| ACC-02 | `/contas` | M | create cash account → `POST /accounts` | invalid name/amount | accounts |
| ACC-03 | `/contas` | M | create credit card → `POST /cards` | invalid limit/days | accounts |
| ACC-04 | `/contas` | M | edit bank account → `PATCH /accounts/:id` | 500 banner/retry | accounts |
| ACC-05 | `/contas` | M | edit credit card → card endpoint | 500 banner/retry | accounts |
| ACC-06 | `/contas` | M | confirm deactivation → `POST /accounts/:id/deactivate` | cancel/no mutation | accounts |
| CAT-01 | `/categorias` | M | create expense category → `POST /categories` | blank/422 | categories |
| CAT-02 | `/categorias` | M | create income category → `POST /categories` | blank/422 | categories |
| CAT-03 | `/categorias` | M | add subcategory → correct journal | cancel/error | categories |
| CAT-04 | `/categorias` | M | edit category → PATCH endpoint | cancel/422 | categories |
| CAT-05 | `/categorias` | M | deactivate category → `POST /categories/:id/deactivate` | cancel/no mutation | categories |
| PAY-01 | `/a-pagar` | M,D | create payable → `POST /payables` | invalid fields/422 | payables |
| PAY-02 | `/a-pagar` | M | select status filter → list filtered | empty result | payables |
| PAY-03 | `/a-pagar` | M | mark payable as paid → pay endpoint | API 500 | payables |
| PAY-04 | `/a-pagar` | M | undo payment → undo endpoint | no previous payment | payables |
| PAY-05 | `/a-pagar` | M | cancel payable → cancel endpoint | cancel confirmation | payables |
| PAY-06 | `/a-pagar` | M | save payable edit → `PATCH /payables/:id` | cancel | payables |
| BUD-01 | `/orcamentos` | M | tap expense tab → expense type/category pickers show | empty categories | budgets |
| BUD-02 | `/orcamentos` | M | tap income tab → income type/category pickers show | empty categories | budgets |
| BUD-03 | `/orcamentos` | M | create budget → budget endpoint | missing amount/category | budgets |
| BUD-04 | `/orcamentos` | M | update budget → update endpoint | missing amount/category | budgets |
| GOAL-01 | `/metas` | M | tap goals tab → goal type chooser renders | empty state | goals |
| GOAL-02 | `/metas` | M | tap debts tab → debt type chooser renders | empty state | goals |
| GOAL-03 | `/metas` | M | create goal → goal endpoint | invalid target/500 | goals |
| GOAL-04 | `/metas` | M | edit goal → update endpoint | invalid target/500 | goals |
| GOAL-05 | `/metas` | M | contribute to goal → contribute endpoint/progress | invalid amount | goals |
| GOAL-06 | `/metas` | M | cancel goal → cancel endpoint | cancel confirmation/error | goals |
| CARD-01 | `/cartoes` | M,D | create card → cards endpoint | invalid fields | cards |
| CARD-02 | `/cartoes` | M,D | edit card → cards update endpoint | invalid fields | cards |
| CARD-03 | `/cartoes` | M | tap card row → card detail opens | empty state | cards |
| CARD-04 | `/cartoes` | M | full payment → statement payment endpoint | missing source account | cards |
| CARD-05 | `/cartoes` | M | partial payment → statement payment endpoint | missing source account | cards |
| CARD-06 | `/cartoes` | M | tap statement row → statement line items show | empty state | cards |
| CARD-07 | `/cartoes` | M | tap purchase row → purchase detail shows | empty state | cards |
| CARD-08 | `/cartoes` | M | save purchase edit → `PATCH /cards/purchases/:id` | 422 | cards |
| SUB-01 | `/assinaturas` | M | tap subscription tab → list renders | empty state | subscriptions |
| SUB-02 | `/assinaturas` | M | fill and submit create subscription → create endpoint | invalid amount | subscriptions |
| SUB-03 | `/assinaturas` | M | detail subscription → display values | empty state | subscriptions |
| SUB-04 | `/assinaturas` | M | edit subscription → update endpoint | cancel confirmation | subscriptions |
| SUB-05 | `/assinaturas` | M | cancel subscription → cancel endpoint | cancel confirmation/error | subscriptions |
| WAL-01 | `/patrimonio` | M,D | open `/patrimonio` → wallet page renders | empty/degraded | wallet |
| REP-01 | `/relatorios` | M,D | tap period chip → summary/chart updates for that period | empty transactions | reports |
| PROF-01 | `/perfil` | M | save profile name → profile endpoint | profile endpoint/422 | profile |
| PROF-02 | `/perfil` | M | save avatar → profile endpoint | profile endpoint/422 | profile |
| PROF-03 | `/perfil` | M | save greeting → profile endpoint | profile endpoint/422 | profile |
| PROF-04 | `/perfil` | M | tap notification opens item | navigation/state | empty | profile |
| PROF-05 | `/perfil` | M | dismiss notification → state update | swipe fails | profile |
| PROF-06 | `/perfil` | M | logout clears token/snapshot → register | cancel where offered | profile |
| UI-01 | shared sheets | M | back from dirty form shows confirm prompt | preserve state | shared-ui |
| UI-02 | shared sheets | M | close dirty form shows confirm prompt | preserve state | shared-ui |
| UI-03 | shared sheets | M | confirm discard on dirty form → navigates away | discard and navigate | shared-ui |
| UI-04 | shared sheets | M | cancel discard on dirty form → stays on form | form unchanged | shared-ui |
| UI-05 | banners | M | stale error retry button → retry journal | retry succeeds | shared-ui |
| UI-06 | banners | M | stale error dismiss button → no retry | banner hidden | shared-ui |
| UI-07 | banners | M | write-error retry button → retry journal | retry succeeds | shared-ui |
| UI-08 | banners | M | write-error dismiss button → no retry | banner hidden | shared-ui |
| PWA-01 | SW | P | install SW → offline shell renders on network failure | network failure only | pwa-runtime |
| PWA-02 | SW migration | P | legacy `pi-finance-shell` removed; no HTML/RSC cached | old chunks never requested | pwa-runtime |
| PWA-03 | SW update | P | clean form triggers waiting worker → activates once and reloads | null waiting safe | pwa-runtime |
| PWA-04 | SW reload | P | reload with active SW → offline shell still renders on network failure | network failure only | pwa-runtime |
| PWA-05 | SW dirty | P | dirty form retains waiting worker → no activation on dirty | null waiting safe | pwa-runtime |
| SMOKE-01 | `/` | opt-in | direct load `/` styled/read-only | no auth | production-smoke |
| SMOKE-02 | `/registros` | opt-in | direct load `/registros` styled/read-only | no auth | production-smoke |
| SMOKE-03 | `/contas` | opt-in | direct load `/contas` styled/read-only | no auth | production-smoke |
| SMOKE-04 | `/cartoes` | opt-in | direct load `/cartoes` styled/read-only | no auth | production-smoke |

## Contract-only coverage
`manifest.webmanifest`, `/pwa-control`, RUM route, not-found, headers and static assets remain dedicated Vitest/contract tests; they are not application pages.

## Matrix gate
A new visible action must add one action ID, expected fixture journal/UI assertion, negative behavior and owning spec before merge. No action ID may be unowned.
