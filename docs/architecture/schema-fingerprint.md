# Schema Fingerprint — pi-financeiro

**Phase 2.1** — Extracted from migrations V001–V012 and domain code.
No live DB connection available; fingerprint based on SQL schema + TypeScript types.

## Database identity

- **Engine:** PostgreSQL 16+
- **Extension:** pgcrypto (UUID generation)
- **Schema:** `public`
- **Balance semantics:** STORED column (`accounts.balance_cents`), manually maintained by write store. Constraint: `balance_cents >= 0`. Updates use `GREATEST(0, balance_cents - X)` to prevent negative values. No computed/trigger-based balance.

## Tables (15)

| # | Table | Primary Key | Key Constraints |
|---|-------|-------------|-----------------|
| 1 | `accounts` | `id UUID` | `kind IN ('bank','cash','credit_card')`, `balance_cents >= 0`, `status IN ('active','inactive')` |
| 2 | `categories` | `id UUID` | `kind IN ('expense','income')`, `status IN ('active','inactive')`, `parent_id → categories(id)` |
| 3 | `transactions` | `id UUID` | `kind IN ('expense','income','transfer')`, `amount_cents > 0`, FK→accounts, FK→categories, FK→transfer_to_account, `CHECK (kind='transfer' XOR category_id IS NOT NULL)`, `CHECK (kind='transfer' XOR transfer_to_account_id IS NULL)` |
| 4 | `device_tokens` | `token TEXT` | FK→household, `revoked_at` soft-delete |
| 5 | `idempotency_keys` | `(household_id, key)` | `payload_hash TEXT`, `response JSONB`, TTL 24h lazy eviction |
| 6 | `statements` | `id UUID` | FK→accounts, `status IN ('open','closed','paid','partial','overdue','cancelled')`, `cycle_year_month TEXT` |
| 7 | `recurring_purchases` | `id UUID` | FK→accounts, FK→categories, `frequency IN ('monthly','quarterly','yearly')`, `status IN ('active','paused','cancelled')` |
| 8 | `accounts_payable` | `id UUID` | FK→accounts, FK→categories, `type IN ('one_time','recurring')`, `status IN ('pending','paid','overdue','cancelled')`, `paid_transaction_id → transactions(id)` |
| 9 | `payable_templates` | `id UUID` | FK→accounts, `frequency IN ('monthly','quarterly','yearly')`, `day_of_month 1-31` |
| 10 | `notification_configs` | `id UUID` | `UNIQUE(household_id, chat_id, notification_type)`, `notification_type IN ('overdue_reminder','due_today_reminder','upcoming_reminder','daily_summary','weekly_summary')` |
| 11 | `budgets` | `id UUID` | FK→categories, `period IN ('monthly','quarterly','yearly')`, `alert_threshold 1-100` |
| 12 | `goals` | `id UUID` | FK→categories, FK→accounts, `goal_type IN ('savings','purchase','debt_payoff','emergency_fund')`, `status IN ('active','paused','achieved','cancelled','failed')` |
| 13 | `goal_contributions` | `id UUID` | FK→goals, `amount_cents > 0` |
| 14 | `subscriptions` | `id UUID` | `cycle IN ('monthly','yearly','weekly')`, `status IN ('active','cancelled')` |
| 15 | `profiles` | `household_id UUID` | `avatar_color ~ '^#[0-9A-Fa-f]{6}$'`, `greeting_style IN ('auto','minimal','verbose')` |

## Indexes (non-PK)

- `accounts_household_status_idx` — (household_id, status) WHERE deleted_at IS NULL
- `categories_household_status_idx` — (household_id, status) WHERE deleted_at IS NULL
- `categories_parent_id_idx` — (parent_id) WHERE parent_id IS NOT NULL
- `transactions_household_date_idx` — (household_id, date DESC, id DESC) WHERE deleted_at IS NULL
- `transactions_household_account_idx` — (household_id, account_id) WHERE deleted_at IS NULL
- `transactions_household_category_idx` — (household_id, category_id) WHERE deleted_at IS NULL
- `transactions_household_kind_idx` — (household_id, kind) WHERE deleted_at IS NULL
- `transactions_statement_idx` — (statement_id) WHERE NOT NULL AND deleted_at IS NULL
- `device_tokens_household_idx` — (household_id) WHERE revoked_at IS NULL
- `idempotency_keys_created_at_idx` — (created_at)
- `statements_account_cycle_idx` — (account_id, cycle_year_month)
- `statements_household_status_idx` — (household_id, status)
- `recurring_account_idx` — (account_id) WHERE status = 'active'
- `payables_household_status_idx` — (household_id, status) WHERE deleted_at IS NULL
- `payables_due_idx` — (household_id, due_date) WHERE status = 'pending' AND deleted_at IS NULL
- `accounts_payable_paid_tx_idx` — (paid_transaction_id) WHERE NOT NULL
- `templates_household_active_idx` — (household_id) WHERE active = true
- `notification_household_chat_idx` — (household_id, chat_id)
- `budgets_household_idx` — (household_id)
- `goals_household_status_idx` — (household_id, status)
- `goal_contributions_goal_idx` — (goal_id)
- `subscriptions_household_active_idx` — (household_id) WHERE status = 'active' AND deleted_at IS NULL

## Triggers

- `set_updated_at()` — updates `updated_at = NOW()` on BEFORE UPDATE for: accounts, categories, transactions, statements, recurring_purchases, accounts_payable, payable_templates, notification_configs, budgets, goals

## Soft-delete pattern

Tables with `deleted_at TIMESTAMPTZ`: accounts, categories, transactions, accounts_payable, subscriptions. Indexes use `WHERE deleted_at IS NULL` to exclude soft-deleted rows.

## Household scoping

Every table includes `household_id UUID NOT NULL`. No cross-household references are enforced at DB level (no FK on household_id). All scoping is enforced in application code via `WHERE household_id = $1`.
