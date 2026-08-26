# Schema Fingerprint — pi-financeiro

> **Source of truth:** migrations in `apps/api/src/read-models/sql/` (V001–V016), including the checksum-verified `_migrations` ledger.
> **Production baseline:** legacy path (`DB_SCHEMA=legacy`) skips V001/V002/V004–V007;
> additive-only migrations (V003, V008–V016) run on the live database.
> See [ADR-001](../adr/001-legacy-schema-baseline.md).

## Entity-Relationship Summary

```
household ──→ accounts (N)
household ──→ categories (N, self-referencing via parent_id)
household ──→ transactions (N)
household ──→ accounts_payable (N)
household ──→ budgets (N)
household ──→ goals (N)
household ──→ subscriptions (N)
household ──→ statements (N)
household ──→ device_tokens (N)
household ──→ profiles (1)
household ──→ notification_configs (N)
household ──→ payable_templates (N)

transaction ──→ account (N:1)
transaction ──→ category (N:1, nullable, transfers have NULL)
transaction ──→ statement (N:1, nullable)
accounts_payable ──→ account (N:1)
accounts_payable ──→ category (N:1, nullable)
goals ──→ category (N:1, nullable)
goals ──→ account (N:1, nullable)
goal_contributions ──→ goals (N:1)
operation_records ──→ audit_logs (1:N)
```

## Table Definitions

### `accounts`

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK DEFAULT gen_random_uuid() |
| household_id | UUID | NOT NULL |
| name | TEXT | NOT NULL, CHECK(length BETWEEN 1 AND 120) |
| kind | TEXT | NOT NULL, CHECK(kind IN ('bank','cash','credit_card')) |
| balance_cents | BIGINT | NOT NULL, CHECK(>= 0) |
| credit_limit_cents | BIGINT | nullable (V004) |
| closing_day | INTEGER | nullable, CHECK(1..31) (V004) |
| due_day | INTEGER | nullable, CHECK(1..31) (V004) |
| status | TEXT | NOT NULL, CHECK(status IN ('active','inactive')) |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT NOW() |
| updated_at | TIMESTAMPTZ | NOT NULL DEFAULT NOW() |
| deleted_at | TIMESTAMPTZ | nullable |

**Indexes:**
- `accounts_household_status_idx` ON (household_id, status) WHERE deleted_at IS NULL

**Triggers:** `accounts_set_updated_at` BEFORE UPDATE

---

### `categories`

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK DEFAULT gen_random_uuid() |
| household_id | UUID | NOT NULL |
| name | TEXT | NOT NULL, CHECK(length BETWEEN 1 AND 120) |
| kind | TEXT | NOT NULL, CHECK(kind IN ('expense','income')) |
| parent_id | UUID | FK(categories.id) nullable (V009) |
| status | TEXT | NOT NULL, CHECK(status IN ('active','inactive')) |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT NOW() |
| updated_at | TIMESTAMPTZ | NOT NULL DEFAULT NOW() |
| deleted_at | TIMESTAMPTZ | nullable |

**Indexes:**
- `categories_household_status_idx` ON (household_id, status) WHERE deleted_at IS NULL
- `categories_parent_id_idx` ON (parent_id) WHERE parent_id IS NOT NULL

**Triggers:** `categories_set_updated_at` BEFORE UPDATE

---

### `transactions`

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK DEFAULT gen_random_uuid() |
| household_id | UUID | NOT NULL |
| kind | TEXT | NOT NULL, CHECK(kind IN ('expense','income','transfer')) |
| description | TEXT | NOT NULL, CHECK(length BETWEEN 1 AND 240) |
| amount_cents | BIGINT | NOT NULL, CHECK(> 0) |
| date | DATE | NOT NULL |
| account_id | UUID | NOT NULL |
| category_id | UUID | nullable (transfers have NULL — see CHECK) |
| transfer_to_account_id | UUID | nullable |
| statement_id | UUID | FK(statements.id) nullable (V004) |
| installments_total | INTEGER | nullable, CHECK(1..48) (V004) |
| installment_number | INTEGER | nullable, CHECK(1..48) (V004) |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT NOW() |
| updated_at | TIMESTAMPTZ | NOT NULL DEFAULT NOW() |
| deleted_at | TIMESTAMPTZ | nullable |

**CHECK constraints:**
- `transactions_category_consistency_chk`: `(kind='transfer' AND category_id IS NULL) OR (kind<>'transfer')`
- `transactions_transfer_to_account_chk`: `(kind='transfer' AND transfer_to_account_id IS NOT NULL AND transfer_to_account_id<>account_id) OR (kind<>'transfer' AND transfer_to_account_id IS NULL)`

**Indexes** (all WHERE deleted_at IS NULL):
- `transactions_household_date_idx` ON (household_id, date DESC, id DESC)
- `transactions_household_account_idx` ON (household_id, account_id)
- `transactions_household_category_idx` ON (household_id, category_id)
- `transactions_household_kind_idx` ON (household_id, kind)
- `transactions_statement_idx` ON (statement_id) WHERE statement_id IS NOT NULL AND deleted_at IS NULL

**Triggers:** `transactions_set_updated_at` BEFORE UPDATE

---

### `device_tokens`

| Column | Type | Constraints |
|--------|------|-------------|
| token | TEXT | PK |
| device_id | TEXT | NOT NULL |
| household_id | UUID | NOT NULL |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT NOW() |
| revoked_at | TIMESTAMPTZ | nullable |

**Index:**
- `device_tokens_household_idx` ON (household_id) WHERE revoked_at IS NULL

---

### `idempotency_keys` (V002/V003)

| Column | Type | Constraints |
|--------|------|-------------|
| household_id | UUID | NOT NULL, PK (part of composite) |
| key | TEXT | NOT NULL, PK (part of composite) |
| payload_hash | TEXT | NOT NULL |
| response | JSONB | NOT NULL |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT NOW() |

**PK:** (household_id, key)

**Indexes:**
- `idempotency_keys_created_at_idx` ON (created_at)

---

### `operation_records` (V013–V014, V016)

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK DEFAULT gen_random_uuid() |
| workspace_id | UUID | NOT NULL |
| actor_type | TEXT | NOT NULL, CHECK('device'|'user'), DEFAULT 'device' (V016) |
| actor_id | TEXT | NOT NULL |
| operation | TEXT | NOT NULL |
| idempotency_key | TEXT | NOT NULL |
| payload_hash | TEXT | NOT NULL |
| status | TEXT | NOT NULL, CHECK('processing'|'completed'|'failed') |
| response | JSONB | nullable |
| effect_ref | TEXT | nullable |
| lease_until | TIMESTAMPTZ | NOT NULL (V014) |
| retry_until | TIMESTAMPTZ | NOT NULL (V014) |
| retention_until | TIMESTAMPTZ | NOT NULL (V014) |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT NOW() |
| completed_at | TIMESTAMPTZ | nullable |

**UNIQUE:** (workspace_id, idempotency_key)

**Indexes:**
- `operation_records_created_at_idx` ON (created_at)

### `audit_logs` (V013, V016)

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK DEFAULT gen_random_uuid() |
| operation_record_id | UUID | NOT NULL, FK(operation_records.id) |
| workspace_id | UUID | NOT NULL |
| actor_type | TEXT | NOT NULL, CHECK('device'|'user'), DEFAULT 'device' (V016) |
| actor_id | TEXT | NOT NULL |
| operation | TEXT | NOT NULL |
| event_type | TEXT | NOT NULL |
| payload_hash | TEXT | NOT NULL |
| effect_ref | TEXT | nullable |
| metadata | JSONB | NOT NULL DEFAULT '{}' |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT NOW() |

**Indexes:**
- `audit_logs_operation_record_idx` ON (operation_record_id)
- `audit_logs_workspace_created_idx` ON (workspace_id, created_at)
- `audit_logs_actor_created_idx` ON (workspace_id, actor_type, actor_id, created_at)

---

### `accounts_payable` (V005)

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK DEFAULT gen_random_uuid() |
| household_id | UUID | NOT NULL |
| account_id | UUID | NOT NULL, FK(accounts.id) |
| description | TEXT | NOT NULL |
| amount_cents | BIGINT | NOT NULL, CHECK(> 0) |
| due_date | DATE | NOT NULL |
| type | TEXT | NOT NULL DEFAULT 'one_time', CHECK('one_time'|'recurring') |
| frequency | TEXT | nullable, CHECK('monthly'|'quarterly'|'yearly') |
| end_date | DATE | nullable |
| status | TEXT | NOT NULL DEFAULT 'pending', CHECK('pending'|'paid'|'overdue'|'cancelled') |
| paid_date | DATE | nullable |
| paid_amount_cents | BIGINT | nullable |
| paid_transaction_id | UUID | FK(transactions.id) nullable (V012) |
| reminder_days_before | INTEGER | DEFAULT 0 |
| notes | TEXT | nullable |
| category_id | UUID | FK(categories.id) nullable |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT NOW() |
| updated_at | TIMESTAMPTZ | NOT NULL DEFAULT NOW() |
| deleted_at | TIMESTAMPTZ | nullable |

**Indexes:**
- `payables_household_status_idx` ON (household_id, status) WHERE deleted_at IS NULL
- `payables_due_idx` ON (household_id, due_date) WHERE status = 'pending' AND deleted_at IS NULL
- `accounts_payable_paid_tx_idx` ON (paid_transaction_id) WHERE paid_transaction_id IS NOT NULL

**Triggers:** `payables_set_updated_at` BEFORE UPDATE

---

### `budgets` (V006)

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK DEFAULT gen_random_uuid() |
| household_id | UUID | NOT NULL |
| category_id | UUID | NOT NULL, FK(categories.id) |
| name | TEXT | NOT NULL |
| amount_cents | BIGINT | NOT NULL, CHECK(> 0) |
| period | TEXT | NOT NULL, CHECK('monthly'|'quarterly'|'yearly') |
| start_date | DATE | NOT NULL |
| end_date | DATE | nullable |
| alert_threshold | INTEGER | NOT NULL DEFAULT 80, CHECK(1..100) |
| rollover | BOOLEAN | NOT NULL DEFAULT false |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT NOW() |
| updated_at | TIMESTAMPTZ | NOT NULL DEFAULT NOW() |

**Indexes:**
- `budgets_household_idx` ON (household_id)

**Triggers:** `budgets_set_updated_at` BEFORE UPDATE

---

### `goals` (V007)

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK DEFAULT gen_random_uuid() |
| household_id | UUID | NOT NULL |
| name | TEXT | NOT NULL |
| description | TEXT | nullable |
| goal_type | TEXT | NOT NULL, CHECK('savings'|'purchase'|'debt_payoff'|'emergency_fund') |
| target_amount_cents | BIGINT | NOT NULL, CHECK(> 0) |
| current_amount_cents | BIGINT | NOT NULL DEFAULT 0 |
| start_date | DATE | NOT NULL |
| target_date | DATE | nullable |
| category_id | UUID | FK(categories.id) nullable |
| account_id | UUID | FK(accounts.id) nullable |
| status | TEXT | NOT NULL DEFAULT 'active', CHECK('active'|'paused'|'achieved'|'cancelled'|'failed') |
| notes | TEXT | nullable |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT NOW() |
| updated_at | TIMESTAMPTZ | NOT NULL DEFAULT NOW() |

**Indexes:**
- `goals_household_status_idx` ON (household_id, status)

**Triggers:** `goals_set_updated_at` BEFORE UPDATE

---

### `goal_contributions` (V007)

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK DEFAULT gen_random_uuid() |
| goal_id | UUID | NOT NULL, FK(goals.id) |
| amount_cents | BIGINT | NOT NULL, CHECK(> 0) |
| contribution_date | DATE | NOT NULL |
| source | TEXT | nullable |
| notes | TEXT | nullable |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT NOW() |

**Indexes:**
- `goal_contributions_goal_idx` ON (goal_id)

---

### `statements` (V004)

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK DEFAULT gen_random_uuid() |
| household_id | UUID | NOT NULL |
| account_id | UUID | NOT NULL, FK(accounts.id) |
| cycle_year_month | TEXT | NOT NULL |
| closing_date | DATE | NOT NULL |
| due_date | DATE | NOT NULL |
| total_cents | BIGINT | NOT NULL DEFAULT 0 |
| paid_cents | BIGINT | NOT NULL DEFAULT 0 |
| status | TEXT | NOT NULL DEFAULT 'open', CHECK('open'|'closed'|'paid'|'partial'|'overdue'|'cancelled') |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT NOW() |
| updated_at | TIMESTAMPTZ | NOT NULL DEFAULT NOW() |

**Indexes:**
- `statements_account_cycle_idx` ON (account_id, cycle_year_month)
- `statements_household_status_idx` ON (household_id, status)

**Triggers:** `statements_set_updated_at` BEFORE UPDATE

---

### `recurring_purchases` (V004)

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK DEFAULT gen_random_uuid() |
| household_id | UUID | NOT NULL |
| account_id | UUID | NOT NULL, FK(accounts.id) |
| description | TEXT | NOT NULL |
| amount_cents | BIGINT | NOT NULL, CHECK(> 0) |
| frequency | TEXT | NOT NULL, CHECK('monthly'|'quarterly'|'yearly') |
| start_date | DATE | NOT NULL |
| end_date | DATE | nullable |
| category_id | UUID | FK(categories.id) nullable |
| status | TEXT | NOT NULL DEFAULT 'active', CHECK('active'|'paused'|'cancelled') |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT NOW() |
| updated_at | TIMESTAMPTZ | NOT NULL DEFAULT NOW() |

**Indexes:**
- `recurring_account_idx` ON (account_id) WHERE status = 'active'

**Triggers:** `recurring_purchases_set_updated_at` BEFORE UPDATE

---

### `subscriptions` (V009)

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK DEFAULT gen_random_uuid() |
| household_id | UUID | NOT NULL |
| name | TEXT | NOT NULL, CHECK(length BETWEEN 1 AND 120) |
| amount_cents | BIGINT | NOT NULL, CHECK(> 0) |
| cycle | TEXT | NOT NULL, CHECK('monthly'|'yearly'|'weekly') |
| day | INTEGER | NOT NULL, CHECK(1..31) |
| payment_method | TEXT | NOT NULL, CHECK(length BETWEEN 1 AND 60) |
| status | TEXT | NOT NULL, CHECK('active'|'cancelled') |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT NOW() |
| updated_at | TIMESTAMPTZ | NOT NULL DEFAULT NOW() |
| cancelled_at | TIMESTAMPTZ | nullable |
| deleted_at | TIMESTAMPTZ | nullable |

**Indexes:**
- `subscriptions_household_active_idx` ON (household_id) WHERE status = 'active' AND deleted_at IS NULL

---

### `profiles` (V010–V011)

| Column | Type | Constraints |
|--------|------|-------------|
| household_id | UUID | PK |
| name | TEXT | NOT NULL, CHECK(length BETWEEN 1 AND 80) |
| email | TEXT | NOT NULL DEFAULT '', CHECK(length <= 120) |
| phone | TEXT | NOT NULL DEFAULT '', CHECK(length <= 40) |
| avatar_color | TEXT | NOT NULL, CHECK(~ '^#[0-9A-Fa-f]{6}$') |
| greeting_style | TEXT | NOT NULL, CHECK('auto'|'minimal'|'verbose') |
| updated_at | TIMESTAMPTZ | NOT NULL DEFAULT NOW() |

---

### `notification_configs` (V008)

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK DEFAULT gen_random_uuid() |
| household_id | UUID | NOT NULL |
| chat_id | TEXT | NOT NULL |
| notification_type | TEXT | NOT NULL, CHECK('overdue_reminder'|'due_today_reminder'|'upcoming_reminder'|'daily_summary'|'weekly_summary') |
| enabled | BOOLEAN | NOT NULL DEFAULT true |
| schedule_hour | INTEGER | DEFAULT 9 |
| schedule_minute | INTEGER | DEFAULT 0 |
| days_of_week | INTEGER[] | DEFAULT '{1,2,3,4,5}' |
| threshold_days | INTEGER | DEFAULT 1 |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT NOW() |
| updated_at | TIMESTAMPTZ | NOT NULL DEFAULT NOW() |

**UNIQUE:** (household_id, chat_id, notification_type)

**Indexes:**
- `notification_household_chat_idx` ON (household_id, chat_id)

**Triggers:** `notif_configs_set_updated_at` BEFORE UPDATE

---

### `payable_templates` (V008)

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK DEFAULT gen_random_uuid() |
| household_id | UUID | NOT NULL |
| account_id | UUID | NOT NULL, FK(accounts.id) |
| name | TEXT | NOT NULL |
| description | TEXT | NOT NULL |
| amount_cents | BIGINT | NOT NULL, CHECK(> 0) |
| frequency | TEXT | NOT NULL, CHECK('monthly'|'quarterly'|'yearly') |
| day_of_month | INTEGER | NOT NULL, CHECK(1..31) |
| reminder_days_before | INTEGER | DEFAULT 0 |
| notes | TEXT | nullable |
| active | BOOLEAN | NOT NULL DEFAULT true |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT NOW() |
| updated_at | TIMESTAMPTZ | NOT NULL DEFAULT NOW() |

**Indexes:**
- `templates_household_active_idx` ON (household_id) WHERE active = true

**Triggers:** `templates_set_updated_at` BEFORE UPDATE

---

## Infrastructure Tables

### `_migrations` (internal)

| Column | Type | Constraints |
|--------|------|-------------|
| version | INTEGER | PK |
| name | TEXT | NOT NULL |
| checksum | TEXT | NOT NULL |
| applied_at | TIMESTAMPTZ | NOT NULL DEFAULT NOW() |

Managed by `apps/api/src/read-models/sql/migrate.ts`. Migrations are forward-only; no down-migrations exist.

### Applied migrations (ordered)

| # | Name | Path |
|---|------|------|
| V001 | Init | `V001__init.sql` — canonical only |
| V002 | Idempotency | `V002__idempotency.sql` — canonical only |
| V003 | Legacy safe tables | `V003__legacy_safe_tables.sql` — both paths |
| V004 | Cards | `V004__cards.sql` — canonical only |
| V005 | Payables | `V005__payables.sql` — canonical only |
| V006 | Budgets | `V006__budgets.sql` — canonical only |
| V007 | Goals | `V007__goals.sql` — canonical only |
| V008 | Legacy feature tables | `V008__legacy_feature_tables.sql` — both paths |
| V009 | Categories parent + subscriptions | `V009__categories_parent_subscriptions.sql` — both paths |
| V010 | Household profile | `V010__household_profile.sql` — both paths |
| V011 | Profile email/phone | `V011__profile_email_phone.sql` — both paths |
| V012 | Payables paid transaction ID | `V012__payables_paid_transaction_id.sql` — both paths |
| V013 | Operation records + audit | `V013__operation_records_audit.sql` — both paths |
| V014 | Operation lifecycle columns | `V014__operation_lifecycle_columns.sql` — both paths |
| V015 | Scoped device tokens | `V015__scope_device_tokens.sql` — canonical only |
| V016 | Canonical actor provenance | `V016__canonical_actor_provenance.sql` — both paths |

## Balance Semantics

### Source of truth

Balance is computed by application code in `apps/api/src/writes/postgres.ts` (the **write store**). There is no SQL `SUM()` or materialized view — balance is mutated transactionally alongside each financial record.

### Mutation rules

| Operation | Balance Effect | SQL |
|-----------|---------------|-----|
| `createExpense` | `balance_cents -= amount_cents`, floored at 0 | `SET balance_cents = GREATEST(0, balance_cents - $2)` |
| `createIncome` | `balance_cents += amount_cents` | `SET balance_cents = balance_cents + $2` |
| `createTransfer` | From-account: `-=` (floored at 0); To-account: `+=` | Same as expense + income |
| `softDeleteTransaction` | Reverse: income → subtract, expense → add, transfer → reverse both ends | Reverse SQL of the original operation |
| `updateTransaction` (expense/income) | When `amountCents` changes: restores old balance effect, applies new. When `accountId` changes: reverts old account, applies to new. Expense decrement uses `GREATEST(0)`. | Revert-then-apply |
| `updateTransaction` (transfer) | No balance adjustment. Only `description`/`date` are mutable. | — |
| `deactivateAccount` | No balance change | — |

### Integrity invariants

1. **amount_cents is always positive** (enforced by CHECK in DDL). Sign is encoded by `kind`:
   - `expense`: decreases balance
   - `income`: increases balance
   - `transfer`: decreases from-account, increases to-account
2. **balance_cents is bounded at 0** via `GREATEST(0, ...)`. A `CASH` or `BANK` account can never go negative. The constraint `CHECK(balance_cents >= 0)` in DDL is the database-level guarantee.
3. **Accounts with `credit_card` kind** also have a non-negative balance constraint — the card's available credit is `credit_limit_cents - balance_cents`. A credit card's balance represents total outstanding (purchases minus payments).
4. **`deleted_at IS NULL`** is the soft-delete convention. Active indexes filter on it; the balance is NOT reversed when a transaction is soft-deleted — reversal is a separate operation.
5. **All mutations use `withTransaction`** (via `PoolClient`), ensuring the transaction INSERT/UPDATE/DELETE and balance UPDATE commit atomically.

### Notes

- The **read model** (`ReadModelStore` in `apps/api/src/read-models/`) reads `balance_cents` directly from `accounts` without recalculating — it trusts the write model's transactional updates.
- The legacy schema does NOT have the `set_updated_at()` trigger function. Application code must set `updated_at` explicitly when needed.
- Card statements (`statements`) track `total_cents` and `paid_cents` independently from `accounts.balance_cents`.
