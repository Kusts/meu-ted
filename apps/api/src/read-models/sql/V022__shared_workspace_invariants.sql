-- V022 — shared workspace ownership invariants for G4.2.4.
-- Last owner cannot leave directly. Ownership changes through a pending
-- transfer accepted by its destination.

CREATE TABLE ownership_transfers (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id    UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    from_user_id    UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    to_user_id      UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'accepted', 'cancelled')),
    accepted_by     UUID REFERENCES users(id) ON DELETE RESTRICT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    accepted_at     TIMESTAMPTZ,
    CHECK (from_user_id <> to_user_id),
    CHECK (status <> 'accepted' OR accepted_by = to_user_id)
);

CREATE UNIQUE INDEX ownership_transfers_pending_household_uidx
  ON ownership_transfers (household_id)
  WHERE status = 'pending';

CREATE TABLE ownership_transfer_contexts (
    backend_pid INTEGER NOT NULL,
    transaction_id BIGINT NOT NULL,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    nonce UUID NOT NULL,
    PRIMARY KEY (backend_pid, transaction_id)
);

REVOKE ALL ON ownership_transfer_contexts FROM PUBLIC;

CREATE OR REPLACE FUNCTION set_ownership_transfer_context(user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  context_nonce UUID := gen_random_uuid();
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = user_id) THEN
    RAISE EXCEPTION 'unknown authenticated user';
  END IF;
  DELETE FROM ownership_transfer_contexts WHERE backend_pid = pg_backend_pid();
  INSERT INTO ownership_transfer_contexts (backend_pid, transaction_id, user_id, nonce)
  VALUES (pg_backend_pid(), txid_current(), user_id, context_nonce);
  PERFORM set_config('app.authenticated_user_id', user_id::text, true);
  PERFORM set_config('app.authenticated_context_nonce', context_nonce::text, true);
END;
$$;

-- NOTE (fresh-DB/schema-scoped applies): this function MUST stay LANGUAGE
-- plpgsql, not sql. A LANGUAGE sql body is parse-analyzed at CREATE time
-- against the function's pinned SET search_path (public), so applying this
-- migration into any non-public schema fails with
-- 'relation "ownership_transfer_contexts" does not exist' even though the
-- table was just created in that schema. plpgsql resolves table references
-- at execution time under the caller's search_path, keeping schema-scoped
-- applies (isolated integration-test schemas) working with identical
-- runtime semantics on production (public).
CREATE OR REPLACE FUNCTION ownership_transfer_context_is_trusted(expected_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
      FROM ownership_transfer_contexts
     WHERE backend_pid = pg_backend_pid()
       AND transaction_id = txid_current()
       AND user_id = expected_user_id
       AND nonce::text = current_setting('app.authenticated_context_nonce', true)
  );
END;
$$;

REVOKE INSERT, UPDATE, DELETE ON ownership_transfers FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION set_ownership_transfer_context(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ownership_transfer_context_is_trusted(UUID) TO PUBLIC;

ALTER TABLE ownership_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE ownership_transfers FORCE ROW LEVEL SECURITY;

CREATE POLICY ownership_transfers_select_policy ON ownership_transfers
  FOR SELECT USING (
    current_setting('app.authenticated_user_id', true) IN (from_user_id::text, to_user_id::text)
  );

CREATE POLICY ownership_transfers_insert_policy ON ownership_transfers
  FOR INSERT WITH CHECK (
    status = 'pending'
    AND from_user_id::text = current_setting('app.authenticated_user_id', true)
  );

CREATE POLICY ownership_transfers_update_policy ON ownership_transfers
  FOR UPDATE
  USING (
    status = 'pending'
    AND to_user_id::text = current_setting('app.authenticated_user_id', true)
  )
  WITH CHECK (
    status IN ('accepted', 'cancelled')
    AND accepted_by::text = current_setting('app.authenticated_user_id', true)
  );

DO $$
DECLARE
  workspace RECORD;
  owner_id UUID;
BEGIN
  FOR workspace IN SELECT id FROM households WHERE kind = 'shared' LOOP
    SELECT user_id INTO owner_id
      FROM memberships
     WHERE household_id = workspace.id
       AND role = 'owner' AND status = 'active'
     ORDER BY created_at, user_id
     LIMIT 1;
    IF owner_id IS NULL THEN
      SELECT user_id INTO owner_id
        FROM memberships
       WHERE household_id = workspace.id AND status = 'active'
       ORDER BY created_at, user_id
       LIMIT 1;
      IF owner_id IS NULL THEN
        RAISE EXCEPTION 'shared workspace has no owner candidate: %', workspace.id;
      END IF;
      UPDATE memberships
         SET role = 'owner', kind = 'shared', status = 'active'
       WHERE household_id = workspace.id AND user_id = owner_id;
      IF NOT FOUND THEN
        INSERT INTO memberships (user_id, household_id, role, kind, status)
        VALUES (owner_id, workspace.id, 'owner', 'shared', 'active');
      END IF;
    END IF;
    UPDATE households SET owner_user_id = owner_id WHERE id = workspace.id;
  END LOOP;
END $$;

ALTER TABLE households
  ADD CONSTRAINT households_shared_owner_chk
  CHECK (kind <> 'shared' OR owner_user_id IS NOT NULL);

CREATE OR REPLACE FUNCTION create_shared_workspace_owner_membership()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.kind = 'shared' THEN
    INSERT INTO memberships (user_id, household_id, role, kind, status)
    VALUES (NEW.owner_user_id, NEW.id, 'owner', 'shared', 'active')
    ON CONFLICT (user_id, household_id) DO UPDATE
      SET role = 'owner', kind = 'shared', status = 'active';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS households_shared_membership_creator ON households;
CREATE TRIGGER households_shared_membership_creator
  AFTER INSERT ON households
  FOR EACH ROW EXECUTE FUNCTION create_shared_workspace_owner_membership();

CREATE OR REPLACE FUNCTION protect_shared_workspace_owners()
RETURNS TRIGGER AS $$
DECLARE
  workspace_kind TEXT;
  active_owner_count INTEGER;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT kind INTO workspace_kind
      FROM households WHERE id = OLD.household_id;
    IF workspace_kind IS NULL THEN
      RETURN OLD;
    END IF;
    IF workspace_kind = 'shared' AND OLD.role = 'owner' AND OLD.status = 'active' THEN
      SELECT COUNT(*) INTO active_owner_count
        FROM memberships
       WHERE household_id = OLD.household_id
         AND role = 'owner'
         AND status = 'active';
      IF active_owner_count <= 1 THEN
        RAISE EXCEPTION 'shared workspace must retain at least one owner';
      END IF;
    END IF;
    RETURN OLD;
  END IF;

  SELECT kind INTO workspace_kind
    FROM households WHERE id = OLD.household_id;
  IF workspace_kind = 'shared'
     AND OLD.role = 'owner'
     AND OLD.status = 'active'
     AND (NEW.role <> 'owner' OR NEW.status <> 'active'
          OR NEW.household_id IS DISTINCT FROM OLD.household_id) THEN
    SELECT COUNT(*) INTO active_owner_count
      FROM memberships
     WHERE household_id = OLD.household_id
       AND role = 'owner'
       AND status = 'active';
    IF active_owner_count <= 1 THEN
      RAISE EXCEPTION 'shared workspace must retain at least one owner';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS memberships_shared_owner_guard ON memberships;
CREATE TRIGGER memberships_shared_owner_guard
  BEFORE UPDATE OR DELETE ON memberships
  FOR EACH ROW EXECUTE FUNCTION protect_shared_workspace_owners();

CREATE OR REPLACE FUNCTION assert_shared_workspace_owner()
RETURNS TRIGGER AS $$
DECLARE
  household_to_check UUID;
  workspace_kind TEXT;
BEGIN
  IF TG_OP = 'DELETE' OR TG_OP = 'UPDATE' THEN
    household_to_check := OLD.household_id;
    SELECT kind INTO workspace_kind
      FROM households WHERE id = household_to_check;
    IF workspace_kind = 'shared' AND NOT EXISTS (
      SELECT 1 FROM memberships
       WHERE household_id = household_to_check
         AND role = 'owner' AND status = 'active'
    ) THEN
      RAISE EXCEPTION 'shared workspace must have at least one active owner';
    END IF;
  END IF;

  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    household_to_check := NEW.household_id;
    SELECT kind INTO workspace_kind
      FROM households WHERE id = household_to_check;
    IF workspace_kind = 'shared' AND NOT EXISTS (
      SELECT 1 FROM memberships
       WHERE household_id = household_to_check
         AND role = 'owner' AND status = 'active'
    ) THEN
      RAISE EXCEPTION 'shared workspace must have at least one active owner';
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS memberships_shared_owner_check ON memberships;
CREATE CONSTRAINT TRIGGER memberships_shared_owner_check
  AFTER INSERT OR UPDATE OR DELETE ON memberships
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION assert_shared_workspace_owner();

CREATE OR REPLACE FUNCTION apply_ownership_transfer()
RETURNS TRIGGER AS $$
DECLARE
  workspace_kind TEXT;
  from_role TEXT;
  target_role TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT ownership_transfer_context_is_trusted(NEW.from_user_id) THEN
      RAISE EXCEPTION 'ownership transfer requires authenticated source';
    END IF;
    IF NEW.status <> 'pending' OR NEW.accepted_by IS NOT NULL OR NEW.accepted_at IS NOT NULL THEN
      RAISE EXCEPTION 'ownership transfer must start pending';
    END IF;
    SELECT kind INTO workspace_kind
      FROM households WHERE id = NEW.household_id;
    IF workspace_kind <> 'shared' THEN
      RAISE EXCEPTION 'ownership transfer requires shared workspace';
    END IF;
    SELECT role INTO from_role
      FROM memberships
     WHERE household_id = NEW.household_id
       AND user_id = NEW.from_user_id
       AND status = 'active';
    IF from_role <> 'owner' THEN
      RAISE EXCEPTION 'transfer source must be active owner';
    END IF;
    SELECT role INTO target_role
      FROM memberships
     WHERE household_id = NEW.household_id
       AND user_id = NEW.to_user_id
       AND status = 'active';
    IF target_role <> 'member' THEN
      RAISE EXCEPTION 'transfer destination must be active member';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status <> 'pending' OR NEW.status <> 'accepted' THEN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      RAISE EXCEPTION 'ownership transfer must be accepted by destination';
    END IF;
    RETURN NEW;
  END IF;
  IF NOT ownership_transfer_context_is_trusted(NEW.to_user_id)
     OR NEW.accepted_by IS DISTINCT FROM NEW.to_user_id THEN
    RAISE EXCEPTION 'ownership transfer requires destination acceptance';
  END IF;

  SELECT kind INTO workspace_kind
    FROM households WHERE id = NEW.household_id;
  IF workspace_kind <> 'shared' THEN
    RAISE EXCEPTION 'ownership transfer requires shared workspace';
  END IF;
  SELECT role INTO from_role
    FROM memberships
   WHERE household_id = NEW.household_id
     AND user_id = NEW.from_user_id
     AND status = 'active';
  SELECT role INTO target_role
    FROM memberships
   WHERE household_id = NEW.household_id
     AND user_id = NEW.to_user_id
     AND status = 'active';
  IF from_role <> 'owner' OR target_role <> 'member' THEN
    RAISE EXCEPTION 'ownership transfer participants are no longer valid';
  END IF;

  UPDATE memberships
     SET role = 'owner'
   WHERE household_id = NEW.household_id
     AND user_id = NEW.to_user_id;
  UPDATE households
     SET owner_user_id = NEW.to_user_id
   WHERE id = NEW.household_id;
  UPDATE memberships
     SET role = 'member'
   WHERE household_id = NEW.household_id
     AND user_id = NEW.from_user_id;
  NEW.accepted_at := COALESCE(NEW.accepted_at, NOW());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ownership_transfers_guard ON ownership_transfers;
CREATE TRIGGER ownership_transfers_guard
  BEFORE INSERT OR UPDATE ON ownership_transfers
  FOR EACH ROW EXECUTE FUNCTION apply_ownership_transfer();
