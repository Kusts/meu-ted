-- V052 — additive Pending Operation V2 execution recovery and lease (SPEC §12).
-- Existing rows remain readable; all new columns are nullable (except the
-- counter, which defaults to 0) and are populated only by the V2 claim,
-- reconcile, and success paths. No behavior is changed by this migration
-- alone: claim/lease semantics land in later workstreams.
-- mutation_id persists the MutationReceipt identity on the success path; it
-- carries no uniqueness constraint here (receipt correlation, not a new
-- financial dedup mechanism).
ALTER TABLE pending_operations
  ADD COLUMN IF NOT EXISTS attestation_issued_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS execution_claimed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS execution_lease_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS execution_attempt_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS failure_code TEXT,
  ADD COLUMN IF NOT EXISTS mutation_id TEXT;

-- Recovery scan for abandoned `executing` operations: queries filter
-- execution_status = 'executing' AND execution_lease_expires_at < now().
-- The expiry comparison stays a query condition (never an index predicate:
-- a now()-based predicate would freeze row membership at write time), while
-- the partial predicate mirrors the status filter so the scan stays narrow.
CREATE INDEX IF NOT EXISTS pending_operations_v2_execution_lease_idx
  ON pending_operations (execution_lease_expires_at)
  WHERE protocol_version = 2 AND execution_status = 'executing';
