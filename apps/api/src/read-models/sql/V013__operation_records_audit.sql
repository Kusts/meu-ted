-- V013 — atomic financial command records and audit events.
-- Claim, effect, completion and audit rows are written in one transaction.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS operation_records (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id     UUID NOT NULL,
    actor_id         TEXT NOT NULL,
    operation        TEXT NOT NULL,
    idempotency_key  TEXT NOT NULL,
    payload_hash     TEXT NOT NULL,
    status           TEXT NOT NULL CHECK (status IN ('processing', 'completed', 'failed')),
    response         JSONB,
    effect_ref       TEXT,
    lease_until      TIMESTAMPTZ NOT NULL,
    retry_until      TIMESTAMPTZ NOT NULL,
    retention_until  TIMESTAMPTZ NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at     TIMESTAMPTZ,
    UNIQUE (workspace_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS operation_records_created_at_idx
    ON operation_records (created_at);

CREATE TABLE IF NOT EXISTS audit_logs (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    operation_record_id UUID NOT NULL REFERENCES operation_records(id),
    workspace_id       UUID NOT NULL,
    actor_id           TEXT NOT NULL,
    operation          TEXT NOT NULL,
    event_type         TEXT NOT NULL,
    payload_hash       TEXT NOT NULL,
    effect_ref         TEXT,
    metadata           JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Legacy databases already have an audit_logs table with the original
-- household_id/action shape. Keep that table untouched; canonical indexes are
-- created only when the canonical columns exist.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'audit_logs' AND column_name = 'operation_record_id'
  ) THEN
    CREATE INDEX IF NOT EXISTS audit_logs_operation_record_idx
      ON audit_logs (operation_record_id);
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'audit_logs' AND column_name = 'workspace_id'
  ) THEN
    CREATE INDEX IF NOT EXISTS audit_logs_workspace_created_idx
      ON audit_logs (workspace_id, created_at);
  END IF;
END $$;
