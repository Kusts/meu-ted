-- V048: category uniqueness per household/kind/parent/name (M-02).
--
-- WHAT:
--   1. Deduplicates active, non-deleted categories sharing
--      (household_id, kind, parent (NULL-safe), lower(name)): keeps the
--      oldest row (created_at, id), re-points transactions.category_id and
--      transactions.subcategory_id from losers to the keeper, then marks
--      losers inactive. Display is unchanged (identical names), so no
--      financial history is altered. Idempotent.
--   2. Adds a partial functional UNIQUE index on the same key so writers can
--      use INSERT ... ON CONFLICT DO NOTHING + SELECT and concurrent
--      default applications converge instead of duplicating macros/subs.
--
-- NOT LEGACY-SAFE (canonical schema only): the predicate relies on the
-- canonical `status` + `deleted_at` columns. The legacy schema tracks
-- activity with an `active` boolean; its check-then-insert path is
-- unchanged (documented limitation).
--
-- OPERATIONAL ROLLBACK (forward-only runner, no down migrations):
--   New code tolerates pre-existing duplicates (ON CONFLICT DO NOTHING +
--   SELECT reuses whichever row matches); dropping the index is only safe
--   after confirming no code path relies on the upsert.

-- 1a. Re-point transactions.category_id from losers to the keeper.
UPDATE transactions t
   SET category_id = k.id
  FROM (
    SELECT DISTINCT ON (household_id, kind, COALESCE(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name))
           id, household_id
      FROM categories
     WHERE status = 'active' AND deleted_at IS NULL
     ORDER BY household_id, kind, COALESCE(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name), created_at, id
  ) k
  JOIN categories c
    ON c.household_id = k.household_id
   AND c.kind = (SELECT kind FROM categories WHERE id = k.id)
   AND COALESCE(c.parent_id, '00000000-0000-0000-0000-000000000000'::uuid) =
       COALESCE((SELECT parent_id FROM categories WHERE id = k.id), '00000000-0000-0000-0000-000000000000'::uuid)
   AND lower(c.name) = (SELECT lower(name) FROM categories WHERE id = k.id)
   AND c.status = 'active' AND c.deleted_at IS NULL
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
     WHERE status = 'active' AND deleted_at IS NULL
     ORDER BY household_id, kind, COALESCE(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name), created_at, id
  ) k
  JOIN categories c
    ON c.household_id = k.household_id
   AND c.kind = (SELECT kind FROM categories WHERE id = k.id)
   AND COALESCE(c.parent_id, '00000000-0000-0000-0000-000000000000'::uuid) =
       COALESCE((SELECT parent_id FROM categories WHERE id = k.id), '00000000-0000-0000-0000-000000000000'::uuid)
   AND lower(c.name) = (SELECT lower(name) FROM categories WHERE id = k.id)
   AND c.status = 'active' AND c.deleted_at IS NULL
   AND c.id <> k.id
 WHERE t.subcategory_id = c.id
   AND t.household_id = k.household_id;

-- 1c. Deactivate the loser rows (kept for history, excluded by the index).
UPDATE categories c
   SET status = 'inactive'
  FROM (
    SELECT DISTINCT ON (household_id, kind, COALESCE(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name))
           id, household_id, kind, parent_id, name
      FROM categories
     WHERE status = 'active' AND deleted_at IS NULL
     ORDER BY household_id, kind, COALESCE(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name), created_at, id
  ) k
 WHERE c.household_id = k.household_id
   AND c.kind = k.kind
   AND COALESCE(c.parent_id, '00000000-0000-0000-0000-000000000000'::uuid) =
       COALESCE(k.parent_id, '00000000-0000-0000-0000-000000000000'::uuid)
   AND lower(c.name) = lower(k.name)
   AND c.status = 'active' AND c.deleted_at IS NULL
   AND c.id <> k.id;

-- 2. Partial functional unique index backing the upsert (M-02).
CREATE UNIQUE INDEX IF NOT EXISTS categories_household_kind_parent_name_uidx
    ON categories (household_id, kind, COALESCE(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name))
 WHERE status = 'active' AND deleted_at IS NULL;
