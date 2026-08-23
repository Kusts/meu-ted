-- V033 — Cancelamento auditável de compras no cartão (aditivo, idempotente).
-- Adiciona vínculo explícito e soft-delete para card_purchases.

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

ALTER TABLE card_purchases ADD COLUMN IF NOT EXISTS transaction_id UUID;
ALTER TABLE card_purchases ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- FK para transactions(id) com restrição; transações são soft-deletadas, então RESTRICT é seguro.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'card_purchases_transaction_id_fkey'
      AND table_name = 'card_purchases'
  ) THEN
    ALTER TABLE card_purchases
      ADD CONSTRAINT card_purchases_transaction_id_fkey
      FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS card_purchases_transaction_id_idx ON card_purchases (transaction_id);
CREATE INDEX IF NOT EXISTS card_purchases_active_statement_idx ON card_purchases (household_id, statement_id) WHERE deleted_at IS NULL;
