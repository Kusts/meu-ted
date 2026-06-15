-- V003 — safe migration for legacy pi_financeiro database.
-- Only creates tables that don't exist (device_tokens, idempotency_keys).
-- Does NOT touch existing accounts/categories/transactions tables.
-- Safe to run on both legacy and clean databases.

CREATE TABLE IF NOT EXISTS device_tokens (
    token          TEXT PRIMARY KEY,
    device_id      TEXT NOT NULL,
    household_id   UUID NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS device_tokens_household_idx
    ON device_tokens (household_id)
    WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS idempotency_keys (
    household_id   UUID NOT NULL,
    key            TEXT NOT NULL,
    payload_hash   TEXT NOT NULL,
    response       JSONB NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (household_id, key)
);

CREATE INDEX IF NOT EXISTS idempotency_keys_created_at_idx
    ON idempotency_keys (created_at);
