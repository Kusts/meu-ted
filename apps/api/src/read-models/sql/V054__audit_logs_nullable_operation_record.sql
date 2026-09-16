-- V054 — audit_logs accepts DB-less observability rows (SPEC §24, FIX-F0).
-- Additive and backward-compatible: drops the NOT NULL constraint on
-- audit_logs.operation_record_id (V013) so log-consumed observability events
-- (e.g. POST /client-events counters) can land without a financial
-- operation record. Existing rows, indexes, and the foreign key are
-- untouched; reads keep working.
--
-- Legacy-safe by guard: legacy audit_logs has the household_id/action shape
-- (no operation_record_id column), where this block is a verified no-op.
-- V053 stays RESERVED for the device-token migration (T2.4).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'audit_logs' AND column_name = 'operation_record_id'
  ) THEN
    ALTER TABLE audit_logs ALTER COLUMN operation_record_id DROP NOT NULL;
  END IF;
END $$;
