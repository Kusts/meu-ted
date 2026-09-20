-- V057 — composite household FK for the V056 statement payment link.
--
-- V056 shipped the nullable single-column FK
-- transactions_statement_payment_id_fkey: statement_payment_id -> statements(id).
-- A plain REFERENCES statements(id) accepts a payment in household B pointing
-- at a statement in household A, so the link is upgraded to the composite FK
-- (statement_payment_id, household_id) -> statements(id, household_id): a
-- cross-household pointer fails at the database. NULL statement_payment_id
-- still passes (MATCH SIMPLE) and stays fail-closed.
--
-- Upgrade-safe and idempotent:
-- - Fresh databases: V056 runs first (single FK present), this drops it and
--   enforces the composite. Re-runs are no-ops (IF NOT EXISTS guards).
-- - Databases where the V056 base already applied: the single-column FK
--   (named or auto-named) is dropped before the composite is added.
-- - Fail-closed on data: existing cross-household pointers allowed under the
--   single FK abort this migration instead of being silently kept.
--
-- Canonical-only by design (like V056): legacy keeps description-matched
-- coverage untouched.

-- Backing UNIQUE for the composite FK target. statements.id is already the
-- PK (hence logically unique), but PostgreSQL only accepts a PK or an
-- explicit UNIQUE covering the exact referenced columns (id, household_id).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'statements_id_household_uidx'
      AND conrelid = 'statements'::regclass
  ) THEN
    ALTER TABLE statements
      ADD CONSTRAINT statements_id_household_uidx UNIQUE (id, household_id);
  END IF;
END $$;

-- Drop every single-column FK from transactions.statement_payment_id to
-- statements (the V056 named constraint and any auto-named remainder from
-- the base shape), so the composite below is the only enforcement.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    WHERE c.contype = 'f'
      AND c.conrelid = 'transactions'::regclass
      AND c.confrelid = 'statements'::regclass
      AND array_length(c.conkey, 1) = 1
      AND EXISTS (
        SELECT 1 FROM pg_attribute a
        WHERE a.attrelid = c.conrelid
          AND a.attnum = ANY (c.conkey)
          AND a.attname = 'statement_payment_id'
      )
  LOOP
    EXECUTE format('ALTER TABLE transactions DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'transactions_statement_payment_household_fkey'
      AND conrelid = 'transactions'::regclass
  ) THEN
    ALTER TABLE transactions
      ADD CONSTRAINT transactions_statement_payment_household_fkey
      FOREIGN KEY (statement_payment_id, household_id)
      REFERENCES statements (id, household_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS transactions_statement_payment_idx
  ON transactions (statement_payment_id)
  WHERE statement_payment_id IS NOT NULL AND deleted_at IS NULL;
