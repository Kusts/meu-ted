-- V040 — account invites for admin-only signup (two-invites model)
-- Signup-only invites: email normalized unique pending, expires, consumed/revoked

CREATE TABLE IF NOT EXISTS account_invites (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email            TEXT NOT NULL,
    email_normalized TEXT NOT NULL,
    token_hash       TEXT NOT NULL UNIQUE,
    expires_at       TIMESTAMPTZ NOT NULL,
    consumed_at      TIMESTAMPTZ,
    revoked_at       TIMESTAMPTZ,
    invited_by       UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS account_invites_email_normalized_idx ON account_invites (email_normalized);
CREATE INDEX IF NOT EXISTS account_invites_token_hash_idx ON account_invites (token_hash);
CREATE INDEX IF NOT EXISTS account_invites_pending_idx ON account_invites (email_normalized) WHERE consumed_at IS NULL AND revoked_at IS NULL;
