-- V056 — structured link for canonical statement payments (base form).
--
-- payStatement previously created only a free-text `Pagamento fatura {cycle}`
-- expense with no structured reference, so reconciliation matched coverage on
-- description equality (spoofable by any manual expense with the same text).
-- This adds the smallest backward-compatible structured origin: a nullable FK
-- from the payment transaction to the paid statement.
--
-- Canonical-only by design: legacy semantics (description-matched coverage)
-- are preserved untouched. The column is nullable with no backfill — old rows
-- keep NULL and simply do not count as structured coverage (fail-closed).
-- It deliberately does NOT reuse transactions.statement_id (purchase link):
-- that column feeds statement_total linked sums, and pointing a payment at it
-- would inflate invoice totals.
--
-- IMMUTABLE BASE: this file is the shape any already-applied database could
-- hold (nullable column + single-column FK to statements(id) + partial
-- index). Do NOT rewrite it to carry the composite household FK — the
-- guarded-era drift guard (V044+) would refuse boot on every database that
-- applied this base. The composite upgrade lives in V057, which drops this
-- single-column FK and enforces
-- (statement_payment_id, household_id) -> statements(id, household_id).

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS statement_payment_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'transactions_statement_payment_id_fkey'
      AND conrelid = 'transactions'::regclass
  ) THEN
    ALTER TABLE transactions
      ADD CONSTRAINT transactions_statement_payment_id_fkey
      FOREIGN KEY (statement_payment_id)
      REFERENCES statements (id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS transactions_statement_payment_idx
  ON transactions (statement_payment_id)
  WHERE statement_payment_id IS NOT NULL AND deleted_at IS NULL;
