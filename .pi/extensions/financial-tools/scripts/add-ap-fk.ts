import { Pool } from "pg";
process.env.DATABASE_URL = "postgresql://postgres:postgres@host.docker.internal:5432/pi_financeiro";

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await pool.query(`
      ALTER TABLE transactions
        ADD COLUMN IF NOT EXISTS paid_account_payable_id UUID REFERENCES accounts_payable(id);

      CREATE INDEX IF NOT EXISTS idx_tx_ap ON transactions(paid_account_payable_id) WHERE paid_account_payable_id IS NOT NULL;
    `);
    console.log("✅ Coluna paid_account_payable_id adicionada");
  } catch (e: any) {
    console.error("❌", e.message);
  } finally {
    await pool.end();
  }
}
main();
