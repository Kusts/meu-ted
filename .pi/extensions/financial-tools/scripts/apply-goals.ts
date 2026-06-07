import { Pool } from "pg";
process.env.DATABASE_URL = "postgresql://postgres:postgres@host.docker.internal:5432/pi_financeiro";

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await pool.query(`
      -- Metas financeiras (juntar X, receita Y, etc)
      CREATE TABLE IF NOT EXISTS goals (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        household_id UUID NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        goal_type TEXT NOT NULL CHECK (goal_type IN (
          'savings',       -- juntar X valor
          'income',        -- aumentar receita em X
          'debt_payoff',   -- quitar dívida
          'emergency_fund',-- reserva de emergência
          'purchase'       -- comprar algo específico
        )),
        target_amount_cents BIGINT NOT NULL CHECK (target_amount_cents > 0),
        current_amount_cents BIGINT DEFAULT 0,
        start_date DATE NOT NULL,
        target_date DATE,  -- null = sem prazo
        category_id UUID,  -- para purchase: para qual categoria guardar
        account_id UUID,   -- conta de destino (opcional)
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN (
          'active', 'paused', 'achieved', 'cancelled', 'failed'
        )),
        achieved_at TIMESTAMPTZ,
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_goals_household
        ON goals(household_id) WHERE status = 'active';

      -- Contribuições para metas
      CREATE TABLE IF NOT EXISTS goal_contributions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        goal_id UUID NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
        household_id UUID NOT NULL,
        amount_cents BIGINT NOT NULL,
        contribution_date DATE NOT NULL,
        source TEXT,  -- 'manual' | 'auto_savings' | 'recurring'
        notes TEXT,
        transaction_id UUID,  -- link para transação
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_goal_contrib_goal
        ON goal_contributions(goal_id, contribution_date DESC);

      -- Orçamentos por categoria
      CREATE TABLE IF NOT EXISTS budgets (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        household_id UUID NOT NULL,
        category_id UUID NOT NULL,
        name TEXT NOT NULL,
        amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
        period TEXT NOT NULL DEFAULT 'monthly' CHECK (period IN (
          'weekly', 'monthly', 'quarterly', 'yearly'
        )),
        start_date DATE NOT NULL,
        end_date DATE,  -- null = indefinido
        rollover BOOLEAN DEFAULT false,  -- saldo acumula para próximo período
        alert_threshold SMALLINT DEFAULT 80,  -- % para alertar (warning)
        alert_threshold_critical SMALLINT DEFAULT 100,  -- % para alertar (exceeded)
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN (
          'active', 'paused', 'cancelled'
        )),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE (household_id, category_id, period, start_date)
      );

      CREATE INDEX IF NOT EXISTS idx_budgets_household
        ON budgets(household_id) WHERE status = 'active';
    `);
    console.log("✅ Schema goals + budgets criado");
  } catch (e: any) {
    console.error("❌", e.message);
  } finally {
    await pool.end();
  }
}
main();
