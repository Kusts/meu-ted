import { Pool } from "pg";
process.env.DATABASE_URL = "postgresql://postgres:postgres@host.docker.internal:5432/pi_financeiro";

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await pool.query(`
      -- Configuração de notificações por household
      CREATE TABLE IF NOT EXISTS notification_settings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        household_id UUID NOT NULL,
        chat_id TEXT NOT NULL,  -- chat do WhatsApp
        notification_type TEXT NOT NULL CHECK (notification_type IN (
          'overdue_reminder',      -- conta vencida
          'due_today_reminder',    -- vence hoje
          'upcoming_reminder',     -- vence em N dias
          'daily_summary',         -- resumo diário
          'weekly_summary',        -- resumo semanal
          'card_closing_soon',     -- fatura fechando
          'limit_alert'            -- limite do cartão
        )),
        enabled BOOLEAN DEFAULT true,
        schedule_hour SMALLINT CHECK (schedule_hour BETWEEN 0 AND 23),  -- hora do dia (0-23)
        schedule_minute SMALLINT DEFAULT 0 CHECK (schedule_minute BETWEEN 0 AND 59),
        days_of_week SMALLINT[],  -- [1,2,3,4,5] = dias úteis
        threshold_days SMALLINT,  -- para upcoming_reminder: X dias antes
        threshold_percent SMALLINT,  -- para limit_alert: % do limite
        last_sent_at TIMESTAMPTZ,  -- controle de idempotência
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE (household_id, chat_id, notification_type)
      );

      CREATE INDEX IF NOT EXISTS idx_notif_household
        ON notification_settings(household_id) WHERE enabled = true;

      -- Log de notificações enviadas (auditoria)
      CREATE TABLE IF NOT EXISTS notification_log (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        household_id UUID NOT NULL,
        chat_id TEXT NOT NULL,
        notification_type TEXT NOT NULL,
        title TEXT,
        message TEXT NOT NULL,
        payload JSONB,  -- dados completos da notificação
        sent_at TIMESTAMPTZ DEFAULT NOW(),
        delivered BOOLEAN DEFAULT false,
        read_at TIMESTAMPTZ,
        source TEXT  -- 'auto' | 'manual' | 'triggered'
      );

      CREATE INDEX IF NOT EXISTS idx_notif_log_household
        ON notification_log(household_id, sent_at DESC);
    `);
    console.log("✅ Schema notification_settings + notification_log criado");
  } catch (e: any) {
    console.error("❌", e.message);
  } finally {
    await pool.end();
  }
}
main();
