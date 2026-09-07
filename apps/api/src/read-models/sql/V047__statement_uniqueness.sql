-- V047: statement uniqueness per billing cycle + card purchase metadata.
--
-- WHAT:
--   1. Deduplicates statements that share (household_id, account_id,
--      cycle_year_month), keeping one row per group (lowest id,
--      deterministic across runs) and re-pointing transactions +
--      card_purchases to the keeper before deleting losers. Idempotent:
--      a second run finds no groups and changes nothing.
--   2. Adds a UNIQUE index on (household_id, account_id, cycle_year_month)
--      so writers can use INSERT ... ON CONFLICT DO NOTHING + SELECT and
--      concurrent purchases in the same cycle converge (H-04).
--   3. Adds subcategory_id + notes to card_purchases (M-04 metadata parity
--      with transactions, which gained them in V045/V046).
--
-- LEGACY_SAFE: yes. Both schemas own statements (household/account/cycle),
-- transactions (statement_id) and card_purchases (statement_id) with the
-- same column names used below. Additive + data-preserving only.
--
-- OPERATIONAL ROLLBACK (forward-only runner, no down migrations):
--   New code reads defensively; dropping the index/columns is only safe
--   after confirming no code path references them.

-- 1a. Re-point transactions from duplicate statements to the keeper.
UPDATE transactions t
   SET statement_id = k.id
  FROM (
    SELECT DISTINCT ON (household_id, account_id, cycle_year_month)
           id, household_id, account_id, cycle_year_month
      FROM statements
     ORDER BY household_id, account_id, cycle_year_month, id
  ) k
  JOIN statements s
    ON s.household_id = k.household_id
   AND s.account_id = k.account_id
   AND s.cycle_year_month = k.cycle_year_month
   AND s.id <> k.id
 WHERE t.statement_id = s.id
   AND t.household_id = k.household_id;

-- 1b. Re-point card_purchases from duplicate statements to the keeper.
UPDATE card_purchases cp
   SET statement_id = k.id
  FROM (
    SELECT DISTINCT ON (household_id, account_id, cycle_year_month)
           id, household_id, account_id, cycle_year_month
      FROM statements
     ORDER BY household_id, account_id, cycle_year_month, id
  ) k
  JOIN statements s
    ON s.household_id = k.household_id
   AND s.account_id = k.account_id
   AND s.cycle_year_month = k.cycle_year_month
   AND s.id <> k.id
 WHERE cp.statement_id = s.id
   AND cp.household_id = k.household_id;

-- 1c. Delete the loser statements (nothing references them anymore).
DELETE FROM statements s
 USING (
    SELECT DISTINCT ON (household_id, account_id, cycle_year_month)
           id, household_id, account_id, cycle_year_month
      FROM statements
     ORDER BY household_id, account_id, cycle_year_month, id
  ) k
 WHERE s.household_id = k.household_id
   AND s.account_id = k.account_id
   AND s.cycle_year_month = k.cycle_year_month
   AND s.id <> k.id;

-- 2. Unique index backing the upsert (H-04).
CREATE UNIQUE INDEX IF NOT EXISTS statements_household_account_cycle_uidx
    ON statements (household_id, account_id, cycle_year_month);

-- 3. Metadata parity on card_purchases (M-04).
ALTER TABLE card_purchases ADD COLUMN IF NOT EXISTS subcategory_id UUID REFERENCES categories(id);
ALTER TABLE card_purchases ADD COLUMN IF NOT EXISTS notes TEXT;
