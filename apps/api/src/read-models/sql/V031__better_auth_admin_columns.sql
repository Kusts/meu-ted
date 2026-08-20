-- V031 — Better Auth admin plugin columns (additive, idempotent).
-- The native V017/V019 create better-auth tables but omit the admin-plugin
-- columns that `auth.api.createUser` (postgres adapter) inserts:
--   - "user".role / banned / banReason / banExpires  (admin plugin)
--   - "account".issuer                             (credential provider row)
-- These ALTERs are additive + IF NOT EXISTS so they are safe on any state
-- (fresh DB, existing DB, or already-patched DB).
--
-- Not legacy-safe: touches modern better-auth tables, so it stays OUT of
-- LEGACY_SAFE_PREFIXES (like V013-V030). Run as part of the canonical
-- migration set on the modern/legacy+better-auth database.

ALTER TABLE "user"
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user',
  ADD COLUMN IF NOT EXISTS banned BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS banReason TEXT,
  ADD COLUMN IF NOT EXISTS banExpires TIMESTAMPTZ;

ALTER TABLE "account"
  ADD COLUMN IF NOT EXISTS issuer TEXT;
