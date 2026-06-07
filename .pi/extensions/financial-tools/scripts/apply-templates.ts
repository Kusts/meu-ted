import { Pool } from "pg";
process.env.DATABASE_URL = "postgresql://postgres:postgres@host.docker.internal:5432/pi_financeiro";

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS account_payable_templates (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        household_id UUID NOT NULL,
        account_id UUID NOT NULL,
        category_id UUID,
        name TEXT NOT NULL,  -- ex: "Netflix"
        description TEXT NOT NULL,  -- ex: "Mensalidade Netflix"
        amount_cents BIGINT NOT NULL,
        frequency TEXT NOT NULL CHECK (frequency IN ('monthly', 'quarterly', 'yearly')),
        day_of_month SMALLINT NOT NULL CHECK (day_of_month BETWEEN 1 AND 31),
        reminder_days_before SMALLINT DEFAULT 3,
        auto_create BOOLEAN DEFAULT true,  -- cria automaticamente o próximo ciclo?
        active BOOLEAN DEFAULT true,
        last_used_date DATE,
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_apt_household
        ON account_payable_templates(household_id) WHERE active = true;
    `);
    console.log("✅ Schema account_payable_templates criado");
  } catch (e: any) {
    console.error("❌", e.message);
  } finally {
    await pool.end();
  }
}
main();
