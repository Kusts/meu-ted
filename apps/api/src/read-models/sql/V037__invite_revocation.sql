-- V037 — Support revocation of pending workspace invites.

ALTER TABLE invites ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS invites_household_pending_idx ON invites (household_id) WHERE consumed_at IS NULL AND revoked_at IS NULL;
