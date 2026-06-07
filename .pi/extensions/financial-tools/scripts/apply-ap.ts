import { Pool } from "pg";
process.env.DATABASE_URL = "postgresql://postgres:postgres@host.docker.internal:5432/pi_financeiro";

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const sql = `
CREATE TABLE IF NOT EXISTS accounts_payable (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL,
  account_id UUID NOT NULL,
  category_id UUID,
  description TEXT NOT NULL,
  amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
  type TEXT NOT NULL DEFAULT 'recurring' CHECK (type IN ('recurring', 'one_time')),
  frequency TEXT CHECK (frequency IN ('monthly', 'quarterly', 'yearly')),
  due_date DATE NOT NULL,
  end_date DATE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'overdue', 'cancelled')),
  paid_date DATE,
  paid_transaction_id UUID,
  reminder_days_before SMALLINT DEFAULT 3,
  last_reminder_sent_at TIMESTAMPTZ,
  source_message_id TEXT,
  notes TEXT,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ap_household ON accounts_payable(household_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_ap_status ON accounts_payable(status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_ap_due ON accounts_payable(due_date) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_ap_type ON accounts_payable(type) WHERE deleted_at IS NULL;
`;

  try {
    await pool.query(sql);
    console.log("✅ Schema accounts_payable criado");
  } catch (e) {
    console.error("❌", e.message);
  } finally {
    await pool.end();
  }
}
main();
