-- V009 — category parent_id support + subscriptions table.
--
-- Safe to run on both canonical and legacy schemas:
-- - parent_id is additive (ALTER TABLE ADD COLUMN IF NOT EXISTS)
-- - subscriptions is a new table (CREATE TABLE IF NOT EXISTS)
--
-- Created WITHOUT updated_at trigger because V001 (which defines
-- set_updated_at()) is skipped in legacy mode.

-- Categories: add parent_id for subcategory support (max depth 1).
ALTER TABLE categories ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES categories(id);
CREATE INDEX IF NOT EXISTS categories_parent_id_idx ON categories (parent_id) WHERE parent_id IS NOT NULL;

-- Subscriptions: store subscription data.
CREATE TABLE IF NOT EXISTS subscriptions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id    UUID NOT NULL,
    name            TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
    amount_cents    BIGINT NOT NULL CHECK (amount_cents > 0),
    cycle           TEXT NOT NULL CHECK (cycle IN ('monthly', 'yearly', 'weekly')),
    day             INTEGER NOT NULL CHECK (day >= 1 AND day <= 31),
    payment_method  TEXT NOT NULL CHECK (length(payment_method) BETWEEN 1 AND 60),
    status          TEXT NOT NULL CHECK (status IN ('active', 'cancelled')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    cancelled_at    TIMESTAMPTZ,
    deleted_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS subscriptions_household_active_idx ON subscriptions (household_id) WHERE status = 'active' AND deleted_at IS NULL;
