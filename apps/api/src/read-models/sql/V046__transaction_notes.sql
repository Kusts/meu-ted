-- V046: free-form observation on transactions ("Mais detalhes", item 10/B4).
--
-- WHAT: adds an optional notes TEXT column on transactions. All additive
-- (IF NOT EXISTS), legacy-safe (both schemas own a transactions table with
-- household scoping; the legacy VPS schema gains the column at boot via
-- LEGACY_SAFE_PREFIXES so the legacy write path can persist notes too).
--
-- DATA DECISION: existing rows keep notes NULL (no observation). The API
-- omits notes when NULL, so old clients and snapshots are unaffected.
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS notes TEXT;
