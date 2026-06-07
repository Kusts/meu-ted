import { Pool } from "pg";
process.env.DATABASE_URL = "postgresql://postgres:postgres@host.docker.internal:5432/pi_financeiro";

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    // Adicionar colunas à notification_settings
    await pool.query(`
      ALTER TABLE notification_settings
        ADD COLUMN IF NOT EXISTS grouping_enabled BOOLEAN DEFAULT true,
        ADD COLUMN IF NOT EXISTS grouping_max_items SMALLINT DEFAULT 5,
        ADD COLUMN IF NOT EXISTS grouping_window_minutes SMALLINT DEFAULT 30;
    `);
    console.log("✅ Colunas de agrupamento adicionadas");
  } catch (e: any) {
    console.error("❌", e.message);
  } finally {
    await pool.end();
  }
}
main();
