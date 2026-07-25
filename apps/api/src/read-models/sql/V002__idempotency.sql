-- V002 — idempotency keys for write endpoints.
-- Records the first response for a (household, key) pair. Subsequent
-- calls with the same payload replay; with a different payload they
-- conflict (409). TTL: 24h, enforced lazily on lookup.

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
