-- Migration 002: Pending Operations for Phase 3
-- Spec: docs/superpowers/specs/2026-06-03-minimal-finance-agent-spec.md
-- Phase 3: Confirmation of high-value operations + pending operations management
-- Requires: 001_initial_schema.sql already applied

BEGIN;

-- ============================================================
-- PENDING OPERATIONS (high-value confirmation queue)
-- One pending operation per chat at a time.
-- Confirmation: user replies "sim" to confirm, "não" to cancel.
-- Expires after 30 minutes (expires_at).
-- ============================================================
CREATE TABLE IF NOT EXISTS pending_operations (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id   UUID REFERENCES households(id),
    user_id        UUID REFERENCES users(id),
    chat_id        TEXT NOT NULL,                          -- WhatsApp chat_id
    kind           TEXT CHECK (kind IN ('expense', 'income', 'transfer')),
    amount_cents   BIGINT NOT NULL,                        -- always positive
    description    TEXT,
    category_id    UUID REFERENCES categories(id),         -- nullable for transfers
    from_account_id UUID REFERENCES accounts(id),          -- nullable for income
    to_account_id  UUID REFERENCES accounts(id),           -- nullable for expense
    date           DATE NOT NULL,
    status         TEXT DEFAULT 'awaiting_confirmation'
                   CHECK (status IN ('awaiting_confirmation', 'confirmed', 'cancelled', 'expired')),
    created_at     TIMESTAMPTZ DEFAULT NOW(),
    expires_at     TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 minutes')
);

-- One pending operation per chat at a time
CREATE UNIQUE INDEX IF NOT EXISTS idx_pending_operations_chat
    ON pending_operations(chat_id)
    WHERE status = 'awaiting_confirmation';

-- Index for user/household lookups
CREATE INDEX IF NOT EXISTS idx_pending_operations_user
    ON pending_operations(user_id)
    WHERE status = 'awaiting_confirmation';

-- Index for expiration cleanup
CREATE INDEX IF NOT EXISTS idx_pending_operations_expires
    ON pending_operations(expires_at)
    WHERE status = 'awaiting_confirmation';

COMMIT;