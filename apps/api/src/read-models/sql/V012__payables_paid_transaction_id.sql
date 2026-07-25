-- V012 — add paid_transaction_id to accounts_payable, support undo payment.
-- Safe for both canonical and legacy schemas.
ALTER TABLE accounts_payable ADD COLUMN IF NOT EXISTS paid_transaction_id UUID REFERENCES transactions(id);
CREATE INDEX IF NOT EXISTS accounts_payable_paid_tx_idx ON accounts_payable (paid_transaction_id) WHERE paid_transaction_id IS NOT NULL;
