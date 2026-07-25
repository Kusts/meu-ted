-- V010 — household profile table.
--
-- One row per household holding the user-facing profile data:
-- display name, avatar color, greeting style. Edits go through
-- PATCH /profile (Slice B of /resumo work).
--
-- Additive — safe to apply on both canonical and legacy schemas.
-- No updated_at trigger because V001 doesn't run in legacy mode.

CREATE TABLE IF NOT EXISTS profiles (
    household_id    UUID PRIMARY KEY,
    name            TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
    email           TEXT NOT NULL DEFAULT '' CHECK (length(email) <= 120),
    phone           TEXT NOT NULL DEFAULT '' CHECK (length(phone) <= 40),
    avatar_color    TEXT NOT NULL CHECK (avatar_color ~ '^#[0-9A-Fa-f]{6}$'),
    greeting_style  TEXT NOT NULL CHECK (greeting_style IN ('auto', 'minimal', 'verbose')),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email TEXT NOT NULL DEFAULT '';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone TEXT NOT NULL DEFAULT '';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_email_length_chk'
  ) THEN
    ALTER TABLE profiles
      ADD CONSTRAINT profiles_email_length_chk CHECK (length(email) <= 120) NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_phone_length_chk'
  ) THEN
    ALTER TABLE profiles
      ADD CONSTRAINT profiles_phone_length_chk CHECK (length(phone) <= 40) NOT VALID;
  END IF;
END $$;
