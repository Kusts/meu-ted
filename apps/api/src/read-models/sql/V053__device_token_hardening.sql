-- V053 — device token hardening: hash at rest + lifecycle (SPEC §9, ADR-015 Opção C).
-- Additive and backward-compatible: adds token_hash (SHA-256 hex, UNIQUE),
-- user_id, name, last_used_at, expires_at and legacy columns to
-- device_tokens; existing rows, indexes and reads keep working.
--
-- Coexistence window (C6/R4, no global logout): pre-existing plaintext rows
-- are backfilled with token_hash = SHA-256(token) computed IN SQL,
-- legacy = TRUE and expires_at = NOW() + 90 days. The 90-day reference
-- window comes from ADR-015 (bearer removal review 2026-12-01); rotation
-- (T2.5) revokes individual predecessors, never the whole table.
--
-- New registrations store only the hash (never the raw secret); the legacy
-- plaintext path accepts non-expired legacy rows during the window.
--
-- Legacy-safe by guard: on schemas without device_tokens (or without the
-- canonical columns) every block is a verified no-op. Drops the V015
-- household-embedding check constraint where present: new tokens are
-- opaque random values (C1) and no longer carry household_id in the secret.

-- 1. New columns (each guarded so pre-V053 / legacy shapes no-op).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'device_tokens'
  ) THEN
    ALTER TABLE device_tokens ADD COLUMN IF NOT EXISTS token_hash CHAR(64);
    ALTER TABLE device_tokens ADD COLUMN IF NOT EXISTS user_id UUID;
    ALTER TABLE device_tokens ADD COLUMN IF NOT EXISTS name TEXT;
    ALTER TABLE device_tokens ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ;
    ALTER TABLE device_tokens ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
    ALTER TABLE device_tokens ADD COLUMN IF NOT EXISTS legacy BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;
END $$;

-- 2. Drop the V015 household-in-secret check: opaque tokens carry no dot.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
     WHERE table_schema = 'public' AND table_name = 'device_tokens'
       AND constraint_name = 'device_tokens_token_scope_ck'
  ) THEN
    ALTER TABLE device_tokens DROP CONSTRAINT device_tokens_token_scope_ck;
  END IF;
END $$;

-- 3. Backfill legacy rows: hash in SQL, mark legacy, open the 90-day window.
-- pgcrypto ships the digest() used here (V001 already requires it).
CREATE EXTENSION IF NOT EXISTS pgcrypto;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'device_tokens' AND column_name = 'token_hash'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'device_tokens' AND column_name = 'token'
  ) THEN
    UPDATE device_tokens
       SET token_hash = encode(digest(token, 'sha256'), 'hex'),
           legacy = TRUE,
           expires_at = NOW() + INTERVAL '90 days'
     WHERE token_hash IS NULL;
  END IF;
END $$;

-- 4. Hash lookup index (UNIQUE; NULLs stay distinct so partially-backfilled
-- shapes never collide).
CREATE UNIQUE INDEX IF NOT EXISTS device_tokens_token_hash_uidx
  ON device_tokens (token_hash);
