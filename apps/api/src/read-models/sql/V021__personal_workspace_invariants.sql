-- V021 — personal workspace invariants for G4.2.3.
-- Personal workspaces have one immutable owner, no invite path, and no
-- personal/shared kind conversion.

ALTER TABLE households
  ADD COLUMN IF NOT EXISTS owner_user_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'households_owner_user_fk'
  ) THEN
    ALTER TABLE households
      ADD CONSTRAINT households_owner_user_fk
      FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE RESTRICT;
  END IF;
END $$;

ALTER TABLE households
  ADD CONSTRAINT households_personal_owner_chk
  CHECK (kind <> 'personal' OR owner_user_id IS NOT NULL);

ALTER TABLE memberships
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'shared';

ALTER TABLE memberships
  ADD CONSTRAINT memberships_kind_chk
  CHECK (kind IN ('personal', 'shared'));

UPDATE memberships m
   SET kind = h.kind
  FROM households h
 WHERE h.id = m.household_id;

CREATE UNIQUE INDEX IF NOT EXISTS memberships_personal_user_uidx
  ON memberships (user_id)
  WHERE kind = 'personal';

CREATE OR REPLACE FUNCTION block_personal_workspace_kind_conversion()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.kind IS DISTINCT FROM NEW.kind THEN
    RAISE EXCEPTION 'workspace kind is immutable';
  END IF;
  IF OLD.kind = 'personal'
     AND OLD.owner_user_id IS DISTINCT FROM NEW.owner_user_id THEN
    RAISE EXCEPTION 'personal workspace owner is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS households_personal_kind_guard ON households;
CREATE TRIGGER households_personal_kind_guard
  BEFORE UPDATE OF kind, owner_user_id ON households
  FOR EACH ROW EXECUTE FUNCTION block_personal_workspace_kind_conversion();

CREATE OR REPLACE FUNCTION block_personal_workspace_invites()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM households
    WHERE id = NEW.household_id AND kind = 'personal'
  ) THEN
    RAISE EXCEPTION 'personal workspace does not accept invites';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS invites_personal_workspace_guard ON invites;
CREATE TRIGGER invites_personal_workspace_guard
  BEFORE INSERT OR UPDATE OF household_id ON invites
  FOR EACH ROW EXECUTE FUNCTION block_personal_workspace_invites();

CREATE OR REPLACE FUNCTION enforce_personal_workspace_membership()
RETURNS TRIGGER AS $$
DECLARE
  workspace_kind TEXT;
  owner_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT kind, owner_user_id INTO workspace_kind, owner_id
      FROM households WHERE id = OLD.household_id;
    IF workspace_kind = 'personal' THEN
      RAISE EXCEPTION 'personal workspace owner membership is required';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.household_id IS DISTINCT FROM OLD.household_id THEN
    SELECT kind INTO workspace_kind
      FROM households WHERE id = OLD.household_id;
    IF workspace_kind = 'personal' THEN
      RAISE EXCEPTION 'personal workspace owner membership cannot move';
    END IF;
  END IF;

  SELECT kind, owner_user_id INTO workspace_kind, owner_id
    FROM households WHERE id = NEW.household_id;
  IF workspace_kind IS NULL THEN
    RAISE EXCEPTION 'membership household does not exist';
  END IF;
  NEW.kind := workspace_kind;
  IF workspace_kind = 'personal'
     AND (NEW.user_id IS DISTINCT FROM owner_id OR NEW.role <> 'owner' OR NEW.status <> 'active') THEN
    RAISE EXCEPTION 'personal workspace allows only its active owner';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS memberships_personal_workspace_guard ON memberships;
CREATE TRIGGER memberships_personal_workspace_guard
  BEFORE INSERT OR UPDATE OR DELETE ON memberships
  FOR EACH ROW EXECUTE FUNCTION enforce_personal_workspace_membership();

CREATE OR REPLACE FUNCTION create_personal_workspace_owner_membership()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.kind = 'personal' THEN
    INSERT INTO memberships (user_id, household_id, role, status)
    VALUES (NEW.owner_user_id, NEW.id, 'owner', 'active');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS households_personal_membership_creator ON households;
CREATE TRIGGER households_personal_membership_creator
  AFTER INSERT ON households
  FOR EACH ROW EXECUTE FUNCTION create_personal_workspace_owner_membership();
