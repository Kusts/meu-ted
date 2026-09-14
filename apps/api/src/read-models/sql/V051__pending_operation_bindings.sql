-- V051 — additive Pending Operation V2 bindings and one-use execution state.
-- Existing V1 rows remain readable; all V2 columns are nullable for rollback
-- compatibility and are populated only by the V2 API surface.
ALTER TABLE pending_operations
  ADD COLUMN IF NOT EXISTS protocol_version INTEGER,
  ADD COLUMN IF NOT EXISTS actor_id TEXT,
  ADD COLUMN IF NOT EXISTS device_id TEXT,
  ADD COLUMN IF NOT EXISTS tool TEXT,
  ADD COLUMN IF NOT EXISTS normalized_args JSONB,
  ADD COLUMN IF NOT EXISTS proposal_hash CHAR(64),
  ADD COLUMN IF NOT EXISTS attestation_hash CHAR(64),
  ADD COLUMN IF NOT EXISTS attestation_consumed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS execution_status TEXT,
  ADD COLUMN IF NOT EXISTS execution_result JSONB,
  ADD COLUMN IF NOT EXISTS failed_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pending_operations_v2_version_check') THEN
    ALTER TABLE pending_operations ADD CONSTRAINT pending_operations_v2_version_check
      CHECK (protocol_version IS NULL OR protocol_version = 2);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pending_operations_v2_hash_check') THEN
    ALTER TABLE pending_operations ADD CONSTRAINT pending_operations_v2_hash_check
      CHECK (proposal_hash IS NULL OR proposal_hash ~ '^[0-9a-f]{64}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pending_operations_v2_execution_check') THEN
    ALTER TABLE pending_operations ADD CONSTRAINT pending_operations_v2_execution_check
      CHECK (execution_status IS NULL OR execution_status IN ('proposed','confirmed','executing','succeeded','failed','cancelled','expired'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS pending_operations_v2_workspace_idempotency_idx
  ON pending_operations (workspace_id, idempotency_key)
  WHERE protocol_version = 2 AND workspace_id IS NOT NULL AND idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS pending_operations_v2_attestation_idx
  ON pending_operations (attestation_hash)
  WHERE protocol_version = 2 AND attestation_hash IS NOT NULL;
