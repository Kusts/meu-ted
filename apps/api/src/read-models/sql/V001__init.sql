-- V001 — initial schema for pi-finance-api V1 read models.
-- Mirrors the V1 contract in iphone-finance-app-design.md.
-- One household per V1 (spec: "Scope: one household"). Multi-tenant
-- schema design is out of V1 scope.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- accounts ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS accounts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id    UUID NOT NULL,
    name            TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
    kind            TEXT NOT NULL CHECK (kind IN ('bank', 'cash', 'credit_card')),
    balance_cents   BIGINT NOT NULL CHECK (balance_cents >= 0),
    status          TEXT NOT NULL CHECK (status IN ('active', 'inactive')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS accounts_household_status_idx
    ON accounts (household_id, status)
    WHERE deleted_at IS NULL;

-- categories -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS categories (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id    UUID NOT NULL,
    name            TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
    kind            TEXT NOT NULL CHECK (kind IN ('expense', 'income')),
    status          TEXT NOT NULL CHECK (status IN ('active', 'inactive')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS categories_household_status_idx
    ON categories (household_id, status)
    WHERE deleted_at IS NULL;

-- transactions --------------------------------------------------------
CREATE TABLE IF NOT EXISTS transactions (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id             UUID NOT NULL,
    kind                     TEXT NOT NULL CHECK (kind IN ('expense', 'income', 'transfer')),
    description              TEXT NOT NULL CHECK (length(description) BETWEEN 1 AND 240),
    amount_cents             BIGINT NOT NULL CHECK (amount_cents > 0),
    date                     DATE NOT NULL,
    account_id               UUID NOT NULL,
    category_id              UUID,
    transfer_to_account_id   UUID,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at               TIMESTAMPTZ,
    CONSTRAINT transactions_category_consistency_chk
        CHECK (
            (kind = 'transfer' AND category_id IS NULL)
            OR (kind <> 'transfer')
        ),
    CONSTRAINT transactions_transfer_to_account_chk
        CHECK (
            (kind = 'transfer' AND transfer_to_account_id IS NOT NULL AND transfer_to_account_id <> account_id)
            OR (kind <> 'transfer' AND transfer_to_account_id IS NULL)
        )
);

CREATE INDEX IF NOT EXISTS transactions_household_date_idx
    ON transactions (household_id, date DESC, id DESC)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS transactions_household_account_idx
    ON transactions (household_id, account_id)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS transactions_household_category_idx
    ON transactions (household_id, category_id)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS transactions_household_kind_idx
    ON transactions (household_id, kind)
    WHERE deleted_at IS NULL;

-- device_tokens -------------------------------------------------------
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

-- updated_at trigger -------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS accounts_set_updated_at ON accounts;
CREATE TRIGGER accounts_set_updated_at
    BEFORE UPDATE ON accounts
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS categories_set_updated_at ON categories;
CREATE TRIGGER categories_set_updated_at
    BEFORE UPDATE ON categories
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS transactions_set_updated_at ON transactions;
CREATE TRIGGER transactions_set_updated_at
    BEFORE UPDATE ON transactions
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
