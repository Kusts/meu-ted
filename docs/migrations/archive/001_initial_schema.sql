-- Migration 001: Initial Schema for Minimal Finance Agent
-- Spec: docs/superpowers/specs/2026-06-03-minimal-finance-agent-spec.md
-- Phase 2 only — accounts, categories, transactions tables
-- Note: pending_operations, audit_logs come in Phase 3 and 4 respectively

BEGIN;

-- ============================================================
-- HOUSEHOLDS (single household MVP, allow-list scope)
-- ============================================================
CREATE TABLE IF NOT EXISTS households (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL,
    high_value_limit_cents BIGINT DEFAULT 50000,  -- R$ 500, confirmation required above
    timezone    TEXT DEFAULT 'America/Sao_Paulo',
    created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- USERS (phone allow-list)
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id UUID REFERENCES households(id),
    phone        TEXT UNIQUE NOT NULL,           -- E.164 format, allow-list key
    name         TEXT,
    active       BOOLEAN DEFAULT TRUE,
    created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ACCOUNTS (balance is CALCULATED, not stored)
-- initial_balance_cents + sum(active transactions) = current balance
-- ============================================================
CREATE TABLE IF NOT EXISTS accounts (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id          UUID REFERENCES households(id),
    name                  TEXT NOT NULL,
    initial_balance_cents BIGINT NOT NULL DEFAULT 0,  -- cents, never FLOAT
    active                BOOLEAN DEFAULT TRUE,
    deleted_at            TIMESTAMPTZ,                -- soft delete
    created_at            TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- CATEGORIES (expense or income kind)
-- ============================================================
CREATE TABLE IF NOT EXISTS categories (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id UUID REFERENCES households(id),
    name         TEXT NOT NULL,
    kind         TEXT CHECK (kind IN ('expense', 'income')),  -- NOT NULL enforced
    active       BOOLEAN DEFAULT TRUE,
    deleted_at   TIMESTAMPTZ,                               -- soft delete
    created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TRANSACTIONS (source of truth for all balances)
-- expense: amount SUBTRAI from from_account
-- income:  amount ADICIONA to to_account
-- transfer: amount SUBTRAI from from_account, ADICIONA to to_account
-- Soft delete only — never physically delete.
-- ============================================================
CREATE TABLE IF NOT EXISTS transactions (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id      UUID REFERENCES households(id),
    kind              TEXT CHECK (kind IN ('expense', 'income', 'transfer')),
    amount_cents      BIGINT NOT NULL,               -- always positive, sign encoded in kind
    description       TEXT,
    category_id       UUID REFERENCES categories(id),
    from_account_id   UUID REFERENCES accounts(id),
    to_account_id     UUID REFERENCES accounts(id),
    date              DATE NOT NULL,
    status            TEXT DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'pending')),
    created_by_user_id UUID REFERENCES users(id),
    source_message_id TEXT,
    idempotency_key   TEXT,
    deleted_at        TIMESTAMPTZ,                  -- soft delete
    created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- INDEXES for common queries
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_transactions_household_date
    ON transactions(household_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_from_account
    ON transactions(from_account_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_to_account
    ON transactions(to_account_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_idempotency
    ON transactions(household_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

COMMIT;