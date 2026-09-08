-- V049: category uniqueness for the legacy schema (M-02 on the VPS).
--
-- WHAT (same intent as V048, legacy-safe):
--   1. Deduplicates active categories sharing
--      (household_id, kind, parent (NULL-safe), lower(name)): keeps one row
--      per group (lowest id, deterministic across runs), re-points
--      transactions.category_id and transactions.subcategory_id from losers
--      to the keeper, then deactivates losers (active = false, kept for
--      history). Display is unchanged (identical names), so no financial
--      history is altered. Idempotent: a second run finds no groups.
--   2. Adds a partial functional UNIQUE index on the same key so writers can
--      use INSERT ... ON CONFLICT DO NOTHING + SELECT and concurrent
--      creations converge instead of duplicating macros/subs.
--
-- DUAL-SCHEMA: the whole body runs inside a DO block that probes
-- information_schema.columns for categories.status. Canonical databases
-- (status exists) are a no-op — V048 already deduped and indexed them.
-- Legacy databases (active boolean, no status) take the legacy path below.
-- Static statements referencing `active` are never planned on canonical
-- because the block RETURNS before reaching them.
--
-- LEGACY PREDICATE: `active = true` only (the legacy deactivation model;
-- deactivateCategory sets active = false). Deliberately not `deleted_at`,
-- whose presence on legacy categories is unproven — the legacy adapters
-- treat active = false as inactive everywhere.
--
-- LEGACY_SAFE: yes. Touches only categories + transactions, which both
-- schemas own with the column names used below (parent_id via legacy-safe
-- V009; subcategory_id on transactions predates V045 usage in the legacy
-- adapters). Additive + data-preserving only.
--
-- OPERATIONAL ROLLBACK (forward-only runner, no down migrations):
--   New code reads defensively (ON CONFLICT DO NOTHING + SELECT reuses
--   whichever row matches); dropping the index is only safe after
--   confirming no code path relies on the upsert.

DO $$
DECLARE
  has_status boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'categories'
       AND column_name = 'status'
  ) INTO has_status;

  IF has_status THEN
    -- Canonical schema: V048 already did this work (dedupe + unique
    -- index). V049 is a strict no-op here; the V048 index remains.
    RETURN;
  END IF;

  -- 1a. Re-point transactions.category_id from losers to the keeper.
  UPDATE transactions t
     SET category_id = k.id
    FROM (
      SELECT DISTINCT ON (household_id, kind, COALESCE(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name))
             id, household_id
        FROM categories
       WHERE active = true
       ORDER BY household_id, kind, COALESCE(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name), id
    ) k
    JOIN categories c
      ON c.household_id = k.household_id
     AND c.kind = (SELECT kind FROM categories WHERE id = k.id)
     AND COALESCE(c.parent_id, '00000000-0000-0000-0000-000000000000'::uuid) =
         COALESCE((SELECT parent_id FROM categories WHERE id = k.id), '00000000-0000-0000-0000-000000000000'::uuid)
     AND lower(c.name) = (SELECT lower(name) FROM categories WHERE id = k.id)
     AND c.active = true
     AND c.id <> k.id
   WHERE t.category_id = c.id
     AND t.household_id = k.household_id;

  -- 1b. Re-point transactions.subcategory_id from losers to the keeper.
  UPDATE transactions t
     SET subcategory_id = k.id
    FROM (
      SELECT DISTINCT ON (household_id, kind, COALESCE(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name))
             id, household_id
        FROM categories
       WHERE active = true
       ORDER BY household_id, kind, COALESCE(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name), id
    ) k
    JOIN categories c
      ON c.household_id = k.household_id
     AND c.kind = (SELECT kind FROM categories WHERE id = k.id)
     AND COALESCE(c.parent_id, '00000000-0000-0000-0000-000000000000'::uuid) =
         COALESCE((SELECT parent_id FROM categories WHERE id = k.id), '00000000-0000-0000-0000-000000000000'::uuid)
     AND lower(c.name) = (SELECT lower(name) FROM categories WHERE id = k.id)
     AND c.active = true
     AND c.id <> k.id
   WHERE t.subcategory_id = c.id
     AND t.household_id = k.household_id;

  -- 1c. Deactivate the loser rows (kept for history, excluded by the index).
  UPDATE categories c
     SET active = false
    FROM (
      SELECT DISTINCT ON (household_id, kind, COALESCE(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name))
             id, household_id, kind, parent_id, name
        FROM categories
       WHERE active = true
       ORDER BY household_id, kind, COALESCE(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name), id
    ) k
   WHERE c.household_id = k.household_id
     AND c.kind = k.kind
     AND COALESCE(c.parent_id, '00000000-0000-0000-0000-000000000000'::uuid) =
         COALESCE(k.parent_id, '00000000-0000-0000-0000-000000000000'::uuid)
     AND lower(c.name) = lower(k.name)
     AND c.active = true
     AND c.id <> k.id;

  -- 2. Partial functional unique index backing the upsert (M-02 on legacy).
  -- Own name: never collides with the V048 canonical index.
  CREATE UNIQUE INDEX IF NOT EXISTS categories_household_kind_parent_name_uidx_legacy
      ON categories (household_id, kind, COALESCE(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name))
   WHERE active = true;
END $$;
