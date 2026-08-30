-- V036 — reversible workspace lifecycle for the workspace manager.

ALTER TABLE households
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';

ALTER TABLE households
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'households_status_chk'
  ) THEN
    ALTER TABLE households
      ADD CONSTRAINT households_status_chk
      CHECK (status IN ('active', 'archived'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'households_archive_timestamp_chk'
  ) THEN
    ALTER TABLE households
      ADD CONSTRAINT households_archive_timestamp_chk
      CHECK ((status = 'active' AND archived_at IS NULL)
          OR (status = 'archived' AND archived_at IS NOT NULL));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS households_status_idx ON households (status);
