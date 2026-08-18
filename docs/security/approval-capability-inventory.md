# Approval capability inventory

**Scope:** G5.2.6 approval boundary. The API is the only side-effect boundary; Agent and Pi may request writes but do not bypass API approval.

## Matrix

| Capability | API write boundary | Risk rule | Pi/Agent path |
|---|---|---|---|
| Accounts | `POST /accounts`, `PATCH /accounts/:id`, `POST /accounts/:id/deactivate` | `initialBalanceCents >= limit`; deactivate always | `create_account`, `update_account`, `deactivate_account` → API |
| Categories | `POST /categories`, `PATCH /categories/:id`, `POST /categories/:id/deactivate` | deactivate always | `create_category`, `update_category`, `deactivate_category` → API |
| Transactions | `POST /transactions/expense`, `/income`, `/transfers`; `PATCH /transactions/:id`; `DELETE /transactions/:id` | amount `>= limit`; delete always | `create_expense`, `create_income`, `create_transfer`, `update_transaction`, `delete_transaction` → API |
| Cards | `POST /cards`, `/cards/purchases`, `/cards/installments`, `/cards/recurring`, `/cards/statements/:id/pay`; `PATCH /cards/:id`, `/cards/purchases/:id` | credit limit/purchase/payment/update amount `>= limit` | `create_credit_card_account`, `create_card_purchase`, `create_card_installments`, `pay_statement` → API |
| Payables | `POST /payables`, `/payables/:id/pay`, `/payables/:id/unpay`, `/payables/:id/cancel`, `/payables/templates`, `/payables/from-template`; `PATCH /payables/:id` | amount `>= limit`; unpay/cancel always | `create_account_payable`, `mark_account_paid`, `cancel_account_payable`, `create_payable_template`, `create_payable_from_template` → API |
| Goals | `POST /goals`, `/goals/:id/contribute`, `/goals/:id/cancel`; `PATCH /goals/:id` | target/contribution amount `>= limit`; cancel always | `create_goal`, `contribute_to_goal`, `cancel_goal` → API |
| Budgets | `POST /budgets`; `PATCH /budgets/:id` | amount `>= limit` | `create_budget`, `update_budget` → API |
| Subscriptions | `POST /subscriptions`, `/subscriptions/:id/cancel`; `PATCH /subscriptions/:id` | amount `>= limit`; cancel always | `create_subscription` boundary (when exposed), current HTTP route → API |
| Pending approval | `GET /pending-operations/:id`, `POST .../:id/approve`, `POST .../:id/reject` | requester and workspace binding; requester only may decide | `get_pending_operation`, `confirm_pending_operation`, `cancel_pending_operation` → API |

## Runtime boundaries

- **API:** `apps/api/src/approvals/guard.ts` evaluates `ApprovalPolicy` and creates `PendingOperation` before a guarded side effect. `apps/api/src/routes/index.ts` injects the same policy/store into all financial route modules.
- **Persistence:** Postgres uses `createPostgresPendingOperationStore`; `V023__pending_operations.sql` is included in both canonical and legacy migration manifests. Tests use the in-memory store explicitly.
- **Agent:** `apps/agent/src/index.ts` emits a short-lived delegated token with workspace, actor, role, capabilities and intention ID. The API pre-handler enforces `financial.write`; Agent never writes directly to a store.
- **Pi:** `.pi/extensions/financial-tools/generated/http-tools.ts` sends migrated tools through `requestPiApiJson`. Pending-operation tools use the same client and are enabled in `capability-flags.ts`; no Pi tool executes SQL or approves locally.
- **Identity:** API `authenticatedContext.deviceId` is the requester for device-token calls; delegated calls use the token subject; both are passed to `PendingOperationStore` and checked again on approval/rejection.
- **Next stage:** approval changes status only. Atomic execution of the approved payload belongs to G5.2.7; no route in this inventory executes a pending payload during approval.
