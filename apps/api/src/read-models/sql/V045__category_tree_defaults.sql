-- V045: category tree columns + subcategory reference on transactions.
--
-- WHAT: adds presentation/governance columns to categories (icon, color,
-- sort_order, is_default, is_system) and an optional subcategory_id on
-- transactions. All additive (IF NOT EXISTS), legacy-safe (both schemas own
-- a categories/transactions table with household scoping).
--
-- DATA DECISION (item 11): pre-existing categories keep parent_id NULL, i.e.
-- they become MACROS. No record is moved and no category_id is rewritten, so
-- no transaction can be orphaned by this migration. Grouping old flat names
-- under new macros is a user-side curation step (edit/move via the UI), never
-- an automatic rewrite of financial history.
--
-- SEEDS: none here. The pt-BR default template lives in
-- src/categories/catalog.ts and is applied per household via
-- POST /categories/apply-defaults (idempotent) or bootstrapped on account
-- creation for empty households — global rows cannot be seeded because every
-- category row requires a household_id.
--
-- OPERATIONAL ROLLBACK (forward-only runner, no down migrations):
--   1. New code reads the new columns defensively (null-tolerant mappers),
--      so rolling back application code first is safe.
--   2. Optionally DROP the added columns only after confirming no code path
--      references them; never drop subcategory_id while rows reference it.

ALTER TABLE categories ADD COLUMN IF NOT EXISTS icon TEXT;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS color TEXT;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS categories_household_parent_idx
  ON categories (household_id, parent_id)
  WHERE deleted_at IS NULL;

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS subcategory_id UUID REFERENCES categories(id);

CREATE INDEX IF NOT EXISTS transactions_household_subcategory_idx
  ON transactions (household_id, subcategory_id)
  WHERE deleted_at IS NULL;
