-- V055 — negative bank/cash balances (user-approved domain rule).
-- Replaces the V001 all-kind `balance_cents >= 0` check on the canonical
-- accounts table with an equivalent conditional check: only `credit_card`
-- rows must stay non-negative; `bank`/`cash` may carry negative balances
-- (including a negative initial balance).
--
-- Additive/forward only: V001 is untouched. Existing rows all satisfy the
-- old constraint, hence satisfy the weaker new one — safe on upgrade and
-- on fresh databases (V001 runs first, this migration swaps the check).
--
-- Canonical-only by manifest: the legacy pi_financeiro accounts shape carries
-- computed balances (initial_balance_cents, no stored balance_cents/kind
-- check), but its production ledger intentionally stops at V054.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'accounts' AND column_name = 'balance_cents'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'accounts' AND column_name = 'kind'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM pg_constraint
       WHERE conrelid = 'public.accounts'::regclass
         AND conname = 'accounts_balance_cents_check'
    ) THEN
      ALTER TABLE accounts DROP CONSTRAINT accounts_balance_cents_check;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
       WHERE conrelid = 'public.accounts'::regclass
         AND conname = 'accounts_balance_nonnegative_card_chk'
    ) THEN
      ALTER TABLE accounts
        ADD CONSTRAINT accounts_balance_nonnegative_card_chk
        CHECK (kind <> 'credit_card' OR balance_cents >= 0);
    END IF;
  END IF;
END $$;
