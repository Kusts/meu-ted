-- V016 — canonical actor provenance for operation and audit records.
-- Existing rows came from the device-token phase; preserve that provenance.

ALTER TABLE operation_records
  ADD COLUMN IF NOT EXISTS actor_type TEXT NOT NULL DEFAULT 'device';

-- Legacy audit_logs uses household_id/action/user_id and is intentionally
-- consumed by the legacy adapter. Add canonical provenance only when the
-- canonical workspace_id column exists.
DO $$
BEGIN
  ALTER TABLE operation_records
    ADD COLUMN IF NOT EXISTS actor_type TEXT NOT NULL DEFAULT 'device';

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'audit_logs' AND column_name = 'workspace_id'
  ) THEN
    ALTER TABLE audit_logs
      ADD COLUMN IF NOT EXISTS actor_type TEXT NOT NULL DEFAULT 'device';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'operation_records_actor_type_check'
       AND conrelid = 'operation_records'::regclass
  ) THEN
    ALTER TABLE operation_records
      ADD CONSTRAINT operation_records_actor_type_check
      CHECK (actor_type IN ('device', 'user'));
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'audit_logs' AND column_name = 'workspace_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'audit_logs_actor_type_check'
       AND conrelid = 'audit_logs'::regclass
  ) THEN
    ALTER TABLE audit_logs
      ADD CONSTRAINT audit_logs_actor_type_check
      CHECK (actor_type IN ('device', 'user'));
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'audit_logs' AND column_name = 'workspace_id'
  ) THEN
    CREATE INDEX IF NOT EXISTS audit_logs_actor_created_idx
      ON audit_logs (workspace_id, actor_type, actor_id, created_at);
  END IF;
END $$;
