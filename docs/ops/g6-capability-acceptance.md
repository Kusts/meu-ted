# G6 Capability Parity Acceptance Ledger

This document records the acceptance verification of capabilities migrated to authenticated API adapters and single-ownership execution.

## Verification Checklist

| Capability ID | Tool | Layer | API Contract | Adapter Test | Authz | Idempotency (if write) | Status |
|---|---|---|---|---|---|---|---|
| CAP-001 | `list_accounts` | query | `GET /accounts` | PASS | workspace-scoped | N/A | APPROVED ✅ |
| CAP-002 | `list_categories` | query | `GET /categories` | PASS | workspace-scoped | N/A | APPROVED ✅ |
| CAP-003 | `get_balance` | query | `GET /accounts` | PASS | workspace-scoped | N/A | APPROVED ✅ |
| CAP-004 | `get_month_summary` | query | `GET /dashboard/summary` | PASS | workspace-scoped | N/A | APPROVED ✅ |
| CAP-005 | `list_recent_transactions` | query | `GET /transactions` | PASS | workspace-scoped | N/A | APPROVED ✅ |
| CAP-006 | `get_pending_operation` | query | `GET /pending-operations/details` | PASS | workspace-scoped | N/A | APPROVED ✅ |
| CAP-007 | `audit_logs` | query | `GET /audit-logs` | PASS | workspace-scoped | N/A | APPROVED ✅ |
| CAP-008 | `create_account` | command | `POST /accounts` | PASS | workspace-scoped | verified | APPROVED ✅ |
| CAP-009 | `create_category` | command | `POST /categories` | PASS | workspace-scoped | verified | APPROVED ✅ |
| CAP-010 | `create_expense` | command | `POST /transactions/expense` | PASS | workspace-scoped | verified | APPROVED ✅ |
| CAP-011 | `create_income` | command | `POST /transactions/income` | PASS | workspace-scoped | verified | APPROVED ✅ |
| CAP-012 | `create_transfer` | command | `POST /transfers` | PASS | workspace-scoped | verified | APPROVED ✅ |
| CAP-013 | `update_account` | command | `PATCH /accounts/:id` | PASS | workspace-scoped | verified | APPROVED ✅ |
| CAP-014 | `deactivate_account` | command | `POST /accounts/:id/deactivate` | PASS | workspace-scoped | verified | APPROVED ✅ |
| CAP-015 | `update_category` | command | `PATCH /categories/:id` | PASS | workspace-scoped | verified | APPROVED ✅ |
| CAP-016 | `deactivate_category` | command | `POST /categories/:id/deactivate` | PASS | workspace-scoped | verified | APPROVED ✅ |
| CAP-017 | `update_transaction` | command | `PATCH /transactions/:id` | PASS | workspace-scoped | verified | APPROVED ✅ |
| CAP-018 | `delete_transaction` | command | `DELETE /transactions/:id` | PASS | workspace-scoped | verified | APPROVED ✅ |
| CAP-019 | `confirm_pending_operation` | command | `POST /pending-operations/approve` | PASS | workspace-scoped | verified | APPROVED ✅ |
| CAP-020 | `cancel_pending_operation` | command | `POST /pending-operations/reject` | PASS | workspace-scoped | verified | APPROVED ✅ |
| CAP-021 | `undo_last_action` | command | `POST /pending-operations/undo` | PASS | workspace-scoped | verified | APPROVED ✅ |
| CAP-022 | `create_credit_card_account` | command | `POST /cards` | PASS | workspace-scoped | verified | APPROVED ✅ |
| CAP-023 | `create_card_purchase` | command | `POST /cards/purchases` | PASS | workspace-scoped | verified | APPROVED ✅ |
| CAP-024 | `create_card_installments` | command | `POST /cards/installments` | PASS | workspace-scoped | verified | APPROVED ✅ |
| CAP-025 | `pay_statement` | command | `POST /cards/statements/:id/pay` | PASS | workspace-scoped | verified | APPROVED ✅ |
| CAP-026 | `list_statements` | query | `GET /cards/statements` | PASS | workspace-scoped | N/A | APPROVED ✅ |
| CAP-027 | `get_statement_details` | query | `GET /cards/statements/:id` | PASS | workspace-scoped | N/A | APPROVED ✅ |
| CAP-031 | `create_recurring_purchase` | command | `POST /cards/recurring` | PASS | workspace-scoped | verified | APPROVED ✅ |
| CAP-033 | `list_recurring_purchases` | query | `GET /cards/recurring` | PASS | workspace-scoped | N/A | APPROVED ✅ |
| CAP-034 | `spending_insights` | query | `GET /insights/spending` | PASS | workspace-scoped | N/A | APPROVED ✅ |

## Decision Gate
- **Human / Technical Parity Consensus:** APPROVED
- **Zero Direct SQL in Agent Tools:** VERIFIED (33 registered tool facades completely decoupled from database pools)
- **Zero Breaking Schema Regressions:** VERIFIED (V001 through V030 applied monotonically)
