-- V018 — normalize invite email identity without changing the financial schema.

ALTER TABLE invites ADD COLUMN IF NOT EXISTS email_normalized TEXT;

UPDATE invites
SET email_normalized = lower(trim(email))
WHERE email_normalized IS NULL;

ALTER TABLE invites ALTER COLUMN email_normalized SET NOT NULL;
CREATE INDEX IF NOT EXISTS invites_email_normalized_idx ON invites (email_normalized);
