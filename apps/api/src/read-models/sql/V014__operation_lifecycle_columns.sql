-- V014 — lifecycle columns for existing operation records.
-- V013 creates these on fresh databases; IF NOT EXISTS upgrades databases
-- where V013 was already applied before the lifecycle policy was fixed.

ALTER TABLE operation_records
  ADD COLUMN IF NOT EXISTS lease_until TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '5 minutes',
  ADD COLUMN IF NOT EXISTS retry_until TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '7 days',
  ADD COLUMN IF NOT EXISTS retention_until TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '90 days';
