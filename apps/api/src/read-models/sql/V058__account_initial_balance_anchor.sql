-- V058 — canonical anchor for materialized account balances (M3 converter).
--
-- The canonical reconciliation derives balances as movements-only
-- (`income − expense − transfer_out + transfer_in`), while the legacy world
-- anchors on `initial_balance_cents + movements`. Without the anchor, every
-- account converted with a nonzero initial balance reports a false drift
-- after the cutover. This adds the anchor column canonically so the
-- reconciliation can compare
-- `balance_cents == initial_balance_cents + movements`.
--
-- Additive/forward only: nullable-free with DEFAULT 0, so existing rows land
-- anchored at zero (identical to the old movements-only derivation — safe on
-- upgrade and on fresh databases). The M3 balances step backfills the true
-- initials from the legacy archive and recomputes `balance_cents`.
--
-- Canonical-only by design (like V055/V056/V057): the legacy
-- pi_financeiro accounts shape already carries `initial_balance_cents`, but
-- its production ledger intentionally stops at V054.

ALTER TABLE accounts ADD COLUMN IF NOT EXISTS initial_balance_cents BIGINT NOT NULL DEFAULT 0;
