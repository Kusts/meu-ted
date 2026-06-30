# PWA CRUD & Reliability Completion Spec

## Goal

Turn `apps/pwa` into a trustworthy visual control surface for the finance data created and managed through WhatsApp/Agent Pi, closing the current write-path breakage, making degraded/read-only state explicit, and exposing the full product-grade CRUD/actions surface already supported by `pi-finance-api`.

## Context

`apps/pwa` is now the canonical frontend in this repo. It is no longer a mock-first companion and must behave like the user-facing visual layer of the finance system:
- the agent creates and updates records through WhatsApp
- the PWA must let the user inspect, correct, confirm, pay, cancel, deactivate, and maintain those records visually
- the backend/API is already live behind device-token auth and already supports more operations than the current PWA exposes

Current state audit:
- live reads exist for accounts, categories, transactions, payables, budgets, goals, subscriptions, cards, and statements
- optimistic writes exist for a subset of domains in `AppStateProvider`
- a critical bug in `lib/api/client.ts` prevents JSON writes from reliably reaching Fastify as parsed JSON
- several screens still behave as read-only or placeholder-only even where matching backend routes already exist
- degraded/snapshot/read-only state is present in state logic but is not surfaced consistently in the UI
- `writeError` exists in state but is effectively invisible to the user

This spec builds on `docs/superpowers/specs/2026-06-26-pwa-backend-source-of-truth-spec.md` and supersedes older placeholder assumptions from the earlier PWA domain specs for payables, goals, and budgets.

## Product Principles

1. **Truthful product behavior.** The PWA shall never claim that a backend capability is missing when the API already supports it.
2. **Backend as source of truth.** Live API data shall drive the product whenever API configuration + auth are present.
3. **Visual correction loop.** The PWA shall make it easy to fix mistakes from WhatsApp-created records, especially transactions.
4. **Optimistic but honest.** Writes may update optimistically, but failures shall rollback and surface visible feedback.
5. **Degraded mode clarity.** Snapshot/unavailable/read-only state shall be obvious on every affected screen.
6. **Phase discipline.** Critical reliability issues shall land before broad CRUD expansion.

## User Decisions Captured

- Scope choice: **B** — close the full mapped CRUD/action gap
- Delivery shape: **2 phases**
- UX depth: **B** — product-complete flows with confirmations, dialogs, empty states, and guards
- Approach: **A hybrid with minimal infra-first base**

## In Scope

- HTTP write correctness for JSON requests
- user-visible write failure feedback
- consistent read-only and stale/unavailable banners across all affected screens
- complete CRUD/action surface in the PWA for backend-supported operations
- transaction edit/delete UX from `Registros`
- truthful replacement of placeholder copy that incorrectly blames missing backend support
- fragile test stabilization for date-relative records filtering
- cleanup/hygiene directly related to this work (`nul`, import placement, hardcoded env fallback review)

## Out of Scope

- inventing new backend routes unless an API gap is confirmed during implementation
- offline write queue / conflict resolution
- redesigning the visual language from scratch
- replacing device-token + PIN auth
- analytics/reporting expansion unrelated to CRUD completion
- broad service-worker/offline caching architecture beyond documenting current limits

## Confirmed Backend Capability Matrix

| Domain | Verified API support | Current PWA state | Target after this spec |
|---|---|---|---|
| Transactions | create, list, patch, delete | create/list; no edit UI; no delete UI | expense/income: full create/read/update/delete; transfer: read + edit `description/date` + delete |
| Accounts | list, create, patch, deactivate | create/list | full create/read/update/deactivate |
| Categories | list, create, patch, deactivate | create/list | full create/read/update/deactivate |
| Cards | list/create/patch, statement pay, purchases/installments/recurring | create/read/update/pay statement | keep supported flows; validate destructive card semantics separately |
| Subscriptions | list, create, cancel | create/read | full create/read/cancel |
| Payables | list, create, pay, cancel | read/pay; create placeholder | full create/read/pay/cancel |
| Budgets | list, create, patch | read; create sheet no-op | full create/read/update |
| Goals | list, create, contribute, cancel | read; create placeholder | full create/read/contribute/cancel |

## Two-Phase Delivery Model

### Phase 1 — Reliability & Shared UX Infrastructure

Purpose: make existing supported behavior actually work and make failure/degraded mode visible.

Includes:
- fix JSON `Content-Type` handling in shared API client
- add regression tests for write headers
- surface `writeError` globally and/or per screen
- surface stale/unavailable/read-only state consistently
- stabilize date-sensitive records tests
- remove misleading backend-missing copy where backend support is already verified
- clean hygiene issues directly affecting maintainability

### Phase 2 — Product-Grade CRUD Completion

Purpose: expose the full supported action surface in the PWA with clear forms, confirmations, and rollback behavior.

Includes:
- transactions edit/delete interaction model from `Registros`
- create/edit/cancel/deactivate flows across supported domains
- contribution/payment/cancel flows where already supported by API
- shared confirm dialog / action sheet patterns
- domain-level tests for each new supported mutation path

## Planning Decomposition Note

This is an umbrella spec. Implementation planning shall be decomposed into:
- Fase 1 — reliability & shared UX infrastructure
- Fase 2A — transactions correction loop
- Fase 2B — accounts and categories
- Fase 2C — payables, budgets, goals, subscriptions, and cards alignment

This decomposition is a planning constraint, not an additional product requirement.

## Shared Architecture Target

### API Layer

`lib/api/client.ts` shall be the single HTTP contract for browser-to-API requests.

Responsibilities:
- inject `Accept: application/json`
- inject `x-device-token`
- inject `Content-Type: application/json` whenever `body` is present and request body is JSON text
- preserve `idempotency-key` support
- normalize `401` into session expiration path
- preserve non-401 error propagation as typed `ApiError`

`lib/api/endpoints.ts` shall become the complete typed REST surface for all supported PWA actions.

### State Layer

`lib/state/app-state-context.tsx` shall remain the single mutation/load coordinator.

Responsibilities:
- optimistic insertion/update/removal where appropriate
- rollback on mutation failure
- global `writeError` source of truth
- per-domain `sync.source` and `sync.syncedAt`
- `readOnly` derivation from essential-domain degradation
- exposure of new mutators for supported CRUD/action flows

### UI Layer

Features shall consume state-layer mutators instead of calling fetch directly.

Shared UI primitives shall cover:
- stale/unavailable/read-only banner
- write-error feedback surface
- confirmation dialog for destructive/cancellation/deactivation actions
- record/action sheet for item-level CRUD affordances
- form sheets/dialogs for create/update flows

## Essential Domain Rules

Essential domains remain:
- accounts
- categories
- transactions
- payables
- budgets
- goals

If any essential domain is `snapshot` or `unavailable`, the PWA shall become read-only for writes.

Non-essential domains may degrade independently:
- subscriptions
- cardStatements

## Requirements

### Reliability and API correctness

REQ-1 (state-driven): While a request is sent through `apiFetch()` with a JSON body, the client shall send `Content-Type: application/json`.

REQ-2 (event-driven): When a JSON write request succeeds, the PWA shall keep optimistic state and reconcile with backend response where applicable.

REQ-3 (event-driven): When a JSON write request fails, the PWA shall rollback optimistic state and surface a visible user-facing error.

REQ-4 (unwanted): If a live read or write returns HTTP 401, then the PWA shall expire the local session, clear cached snapshot state, and return to registration/unlock flow instead of rendering fake fallback data.

### Degraded/read-only UX

REQ-5 (state-driven): While any essential domain is `snapshot` or `unavailable`, the PWA shall block write actions and communicate that the app is in read-only mode.

REQ-6 (state-driven): While a screen depends on one or more `snapshot` domains, the screen shall show a stale-data banner with the oldest relevant sync timestamp when available.

REQ-7 (state-driven): While a screen depends on one or more `unavailable` domains and no snapshot exists, the screen shall show a backend-unavailable banner.

REQ-8 (event-driven): When a user attempts a blocked write in read-only mode, the PWA shall show an explicit error message instead of silently doing nothing.

REQ-9 (state-driven): While `writeError` is present, the PWA shall render it in a visible feedback surface that the user can dismiss or replace with a later error.

### Truthful product copy

REQ-10 (unwanted): If a verified backend route already exists for a capability, then the PWA shall not claim that the backend is still being implemented for that capability.

REQ-11 (state-driven): While a UI flow is intentionally not yet exposed, the PWA shall describe it as a PWA/UI limitation rather than a backend limitation.

### Transactions — full correction loop

REQ-12 (ubiquitous): The `Registros` screen shall remain the central ledger view for browsing and filtering transactions.

REQ-13 (event-driven): When the user taps a transaction row in `Registros`, the PWA shall open an action surface with at least `Editar` and `Excluir` actions.

REQ-14 (state-driven): While the selected transaction is an expense or income, the edit flow shall allow updates to `description`, `date`, `amount`, `account`, and `category` through the existing `/transactions/:id` PATCH route.

REQ-15 (state-driven): While the selected transaction is a transfer, the edit flow shall allow updates only to `description` and `date`, and shall not expose unsupported fields such as `amount`, `account`, or `category`.

REQ-16 (event-driven): When the user confirms transaction deletion, the PWA shall submit a DELETE mutation to the existing `/transactions/:id` backend route through the state layer.

REQ-17 (state-driven): While a transaction mutation is pending, the PWA may apply optimistic UI, but shall rollback and surface error on failure.

### Accounts

REQ-18 (event-driven): When the user creates an account, the PWA shall persist it through the backend-backed state layer.

REQ-19 (event-driven): When the user edits an account, the PWA shall submit an update mutation through the existing backend-supported route.

REQ-20 (event-driven): When the user deactivates an account, the PWA shall require explicit confirmation before submitting the backend mutation.

### Categories

REQ-21 (event-driven): When the user creates a category, the PWA shall persist it through the backend-backed state layer.

REQ-22 (event-driven): When the user edits a category, the PWA shall submit an update mutation through the existing backend-supported route.

REQ-23 (event-driven): When the user deactivates a category, the PWA shall require explicit confirmation before submitting the backend mutation.

### Cards

REQ-24 (state-driven): While card create/edit/pay statement/installment flows are supported by the backend, the PWA shall keep those flows backend-backed and truthful.

REQ-25 (event-driven): When the user pays a statement, edits a card, or creates supported card purchase/installment flows, the PWA shall execute those mutations through the centralized state layer.

REQ-26 (state-driven): Where card deactivation/removal is not yet contract-verified, the PWA shall not expose a destructive card action that lacks confirmed backend support.

### Subscriptions

REQ-27 (event-driven): When the user creates a subscription, the PWA shall persist it through the backend-backed state layer.

REQ-28 (event-driven): When the user cancels a subscription, the PWA shall require confirmation and submit the existing backend-supported cancel route.

### Payables

REQ-29 (event-driven): When the user creates a payable, the PWA shall persist it through the existing backend-supported create route.

REQ-30 (event-driven): When the user marks a payable as paid, the PWA shall use the backend-backed pay mutation through the state layer.

REQ-31 (event-driven): When the user cancels a payable, the PWA shall require confirmation and submit the existing backend-supported cancel route.

### Budgets

REQ-32 (event-driven): When the user creates a budget, the PWA shall persist it through the existing backend-supported create route.

REQ-33 (event-driven): When the user edits a budget, the PWA shall submit an update mutation through the existing backend-supported patch route.

### Goals

REQ-34 (event-driven): When the user creates a goal, the PWA shall persist it through the existing backend-supported create route.

REQ-35 (event-driven): When the user contributes to a goal, the PWA shall submit the existing backend-supported contribution route.

REQ-36 (event-driven): When the user cancels a goal, the PWA shall require confirmation and submit the existing backend-supported cancel route.

## Domain UX Targets

### Records
- preserve current search/filter/grouping behavior
- add tap-to-open actions for transaction rows
- support inline or sheet-based edit form
- use a type-aware edit form: expense/income may edit description/date/amount/account/category; transfer may edit only description/date
- support destructive confirm before delete
- show stale/unavailable and write-error feedback on this screen

### Accounts
- keep current overview/listing
- add item-level edit/deactivate actions
- ensure create/edit/deactivate are blocked in read-only mode with explicit feedback

### Categories
- keep current grouped expense/income layout
- add item-level edit/deactivate actions for categories
- keep category creation backend-backed
- subcategory support is conditional on backend `parentId` contract verification and is not guaranteed by this spec

### Cards
- preserve current list/detail flow
- keep create/edit/pay statement working after header fix
- validate if supported card purchase/installment flows need direct exposure beyond FAB flows
- avoid exposing unsupported delete semantics

### Subscriptions
- add item-level cancel action with confirmation
- move active item to cancelled list after success/optimistic update
- show truthful status badges and stale/write feedback

### Payables
- replace placeholder create sheet with real backend-backed create flow
- keep `Pago` happy path
- add cancel action where payable is not already paid/cancelled
- preserve grouped status UX

### Budgets
- replace no-op create sheet with real create flow
- add edit action from budget card/list item
- preserve read-focused summary/progress presentation

### Goals
- replace placeholder create sheet with real create flow
- add contribution action from goal card
- add cancel action with confirmation
- keep debts as presentational unless separate backend/UI support is added later

## Error Handling Model

- destructive actions shall use explicit confirmation
- form validation errors from backend shall be shown inline inside the active form sheet/dialog
- generic mutation failures and read-only-blocked actions shall appear in a dismissible screen-level banner
- stale/unavailable banners remain separate status banners and shall not be reused for generic write errors
- optimistic rollback shall restore prior visible state exactly once per failed mutation
- non-destructive forms may stay in sheet/dialog after failure so the user can fix and retry

## Action Outcome Rules

- transaction delete shall remove the transaction from the active records list after successful submission or optimistic commit
- delete and deactivate actions shall remove the item from the active list after successful submission or optimistic commit
- cancel subscription, payable, and goal actions shall move the item to its cancelled/done state or list where applicable
- action sheet/dialog shall remain open until successful submission or optimistic commit; it shall not close before validation errors can be shown

## Testing Strategy

### Phase 1
- client tests proving `apiFetch()` sends JSON `Content-Type`
- state-provider tests proving rollback + `writeError` visibility path still works
- screen tests proving stale/unavailable banners appear on all applicable screens
- regression test for records `7d` filter using frozen time or relative fixtures

### Phase 2
- endpoint wrapper tests for new typed actions
- state-provider tests for each added mutator: optimistic update, rollback, 401 expiry
- screen tests for create/edit/cancel/deactivate/contribute/pay flows by domain
- records tests for row tap -> edit/delete action path
- confirmation-dialog tests for destructive actions

## Success Criteria

- JSON writes from the PWA work reliably against the deployed Fastify API.
- Users see explicit feedback for write failures and read-only blocking.
- Every affected screen tells the truth about stale/unavailable/backend-supported state.
- `Registros` becomes the visual correction console for WhatsApp-created transactions.
- Transactions, accounts, categories, subscriptions, payables, budgets, and goals expose the backend-supported action surface defined by this spec instead of placeholder/no-op UI.
- Cards remain aligned with verified backend support without exposing unverified destructive semantics.
- Category/subcategory scope remains honest: executable subcategory work only proceeds after explicit backend `parentId` contract verification.
- The full `apps/pwa` suite passes with the date-fragile records test stabilized.
- Repo hygiene issues directly tied to this work are removed or documented for immediate cleanup.

## Open Decisions Resolved by This Spec

- `apps/pwa` remains the canonical frontend in this repo.
- Delivery is split into 2 phases: reliability first, CRUD completion second.
- Scope is product-grade CRUD/actions for all domains with verified backend support, not only the minimal correction slice.
- Unsupported or unverified destructive card semantics remain out of scope until contract validation exists.
