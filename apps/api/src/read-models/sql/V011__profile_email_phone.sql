-- V011 — add email + phone columns to profiles table.
-- Safe to run on both canonical and legacy schemas.
-- V010 was deployed without these columns; V011 backfills them.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email TEXT NOT NULL DEFAULT '';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone TEXT NOT NULL DEFAULT '';
