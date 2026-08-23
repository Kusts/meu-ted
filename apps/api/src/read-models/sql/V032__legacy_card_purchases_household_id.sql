-- V032 — Legacy card purchases & accounts compatibility (additive, idempotent).
-- Fixes schema divergence in legacy pi_financeiro database (Agent Pi era):
--   - card_purchases: adds household_id, account_id, is_recurring, updated_at
--   - accounts: adds updated_at, created_at
--   - backfills household_id & account_id from statements
--   - aborts safely when an orphan cannot be resolved
-- Safe on clean databases (CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS card_purchases (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id        UUID,
    account_id          UUID,
    statement_id        UUID NOT NULL,
    description         TEXT NOT NULL,
    amount_cents        BIGINT NOT NULL,
    date                DATE NOT NULL,
    category_id         UUID,
    installments_total  INTEGER,
    installment_number  INTEGER,
    is_recurring        BOOLEAN NOT NULL DEFAULT false,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ensure columns exist additively on legacy card_purchases table
ALTER TABLE card_purchases ADD COLUMN IF NOT EXISTS household_id UUID;
ALTER TABLE card_purchases ADD COLUMN IF NOT EXISTS account_id UUID;
ALTER TABLE card_purchases ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE card_purchases ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Ensure columns exist additively on legacy accounts table
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Backfill household_id from statements
UPDATE card_purchases cp
   SET household_id = s.household_id
  FROM statements s
 WHERE cp.statement_id = s.id
   AND cp.household_id IS NULL;

-- Backfill account_id from statements
UPDATE card_purchases cp
   SET account_id = s.account_id
  FROM statements s
 WHERE cp.statement_id = s.id
   AND cp.account_id IS NULL;

-- Fail-safe check for unresolvable orphan records: abort and rollback without deleting data
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM card_purchases WHERE household_id IS NULL) THEN
    RAISE EXCEPTION 'V032 migration aborted: found card_purchases with unresolvable household_id (orphans). Manual intervention required.';
  END IF;
END $$;

-- Indexes for household isolation and fast statement queries
CREATE INDEX IF NOT EXISTS card_purchases_household_statement_idx ON card_purchases (household_id, statement_id);
CREATE INDEX IF NOT EXISTS card_purchases_household_idx ON card_purchases (household_id);
