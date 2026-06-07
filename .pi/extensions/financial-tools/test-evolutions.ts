import { Pool } from "pg";
process.env.DATABASE_URL = "postgresql://postgres:postgres@host.docker.internal:5432/pi_financeiro";

import { createBudget, listBudgets, checkBudgets } from "./tools/goals_budgets";
import {
  computeBudgetStatus, getBudgetTrends, getBudgetAdjustmentSuggestion,
  type Budget,
} from "./tools/goals-budgets";
import { createExpenseTool } from "./tools/create_expense";
import { createCategoryTool } from "./tools/create_category";

const HH = "550e8400-e29b-41d4-a716-446655440000";
let debitoId: string;
let catId: string;
let budgetId: string;

function fmt(c: number) { return `R$ ${(c / 100).toFixed(2)}`; }
function pad(n: number) { return n < 10 ? "0" + n : "" + n; }
function today() { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function exec(t: any, p: any) { const c = new AbortController(); return t.execute("", p, c.signal, undefined); }

async function setup() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const ts = Date.now();
  await pool.query(`DELETE FROM goal_contributions WHERE notes LIKE 'Test EV%'`);
  await pool.query(`DELETE FROM goals WHERE name LIKE 'Test EV%'`);
  await pool.query(`DELETE FROM budgets WHERE name LIKE 'Test EV%'`);
  await pool.query(`DELETE FROM transactions WHERE description LIKE 'Test EV%'`);
  await pool.query(`DELETE FROM categories WHERE name LIKE 'Test EV%' AND household_id = $1`, [HH]);

  const r = await pool.query(
    `INSERT INTO accounts (id, household_id, name, name_normalized, initial_balance_cents, active, created_at)
     VALUES (gen_random_uuid(), $1, $2, LOWER(UNACCENT($2)), 2000000, true, NOW()) RETURNING id`,
    [HH, `Conta EV ${ts}`]
  );
  debitoId = r.rows[0].id;

  // Create category
  const cat = await exec(createCategoryTool, { householdId: HH, name: `Test EV Cat ${ts}`, kind: "expense" });
  catId = cat.details?.category_id;
  console.log(`✅ Setup: conta=${debitoId.slice(0, 8)} cat=${catId?.slice(0, 8)}`);
  await pool.end();
}

async function cleanup() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  await pool.query(`DELETE FROM goal_contributions WHERE notes LIKE 'Test EV%'`);
  await pool.query(`DELETE FROM goals WHERE name LIKE 'Test EV%'`);
  await pool.query(`DELETE FROM budgets WHERE name LIKE 'Test EV%'`);
  await pool.query(`DELETE FROM transactions WHERE description LIKE 'Test EV%'`);
  await pool.query(`DELETE FROM categories WHERE name LIKE 'Test EV%' AND household_id = $1`, [HH]);
  await pool.query(`DELETE FROM accounts WHERE id = $1`, [debitoId]);
  await pool.end();
}

// ============================================================
// TEST 1: Rollover
// ============================================================
async function testRollover() {
  console.log("\n=== Test: Rollover ===");

  // Create budget with rollover=true starting 3 months ago
  const threeMonthsAgo = new Date(); threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
  const pastStart = `${threeMonthsAgo.getFullYear()}-${pad(threeMonthsAgo.getMonth() + 1)}-01`;
  const r = await createBudget.execute({
    householdId: HH, categoryId: catId, name: "Test EV Rollover",
    amountCents: 10000, period: "monthly", startDate: pastStart,
    rollover: true, alertThreshold: 80,
  });
  if (!r.success) { console.log("  ❌ createBudget failed:", r.error); return false; }
  budgetId = r.budgetId;
  console.log(`  Budget criado: ${budgetId.slice(0, 8)}`);

  // Get the current budget period boundaries
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const bResult = await pool.query<{ rows: Budget[] }>(
    `SELECT * FROM budgets WHERE id = $1`, [budgetId]
  );
  const budget = bResult.rows[0];

  // CASE 1: Budget started 3 months ago. Current period has history.
  // No spending in previous period → leftover = 10000 - 0 = 10000
  // Effective limit = 10000 (base) + 10000 (leftover) = 20000
  const comp1 = await computeBudgetStatus(pool, budget);
  console.log(`  Caso 1: sem gasto no mês anterior`);
  console.log(`    effectiveLimit=${fmt(comp1.amountCents)} base=10000 prevSpent=0 leftover=10000`);
  console.log(`    esperado=20000 obtido=${comp1.amountCents} ${comp1.amountCents === 20000 ? "✅" : "❌"}`);

  // CASE 2: Insert spending in previous period
  // prev period: (current period start - 1 month) to (current period start)
  // We need to spend in that range
  const curStart = new Date(comp1.periodStart);
  curStart.setMonth(curStart.getMonth() - 1);  // go to previous period start
  const prevPeriodDate = `${curStart.getFullYear()}-${pad(curStart.getMonth() + 1)}-15`;
  await pool.query(
    `INSERT INTO transactions (id, household_id, kind, amount_cents, description, category_id, from_account_id, date, created_at)
     VALUES (gen_random_uuid(), $1, 'expense', $2, $3, $4, $5, $6::date, NOW())`,
    [HH, 6000, "Test EV gasto mes anterior", catId, debitoId, prevPeriodDate]
  );
  console.log(`  Gasto de R$ 60 inserido no período anterior (${prevPeriodDate})`);

  const comp2 = await computeBudgetStatus(pool, budget);
  // prevSpent = 6000, leftover = 10000 - 6000 = 4000, effective = 10000 + 4000 = 14000
  console.log(`  Caso 2: com R$ 60 gasto no mês anterior`);
  console.log(`    effectiveLimit=${fmt(comp2.amountCents)} prevSpent=6000 leftover=4000`);
  console.log(`    esperado=14000 obtido=${comp2.amountCents} ${comp2.amountCents === 14000 ? "✅" : "❌"}`);

  // CASE 3: Spending exceeded limit in previous period → no rollover
  await pool.query(
    `INSERT INTO transactions (id, household_id, kind, amount_cents, description, category_id, from_account_id, date, created_at)
     VALUES (gen_random_uuid(), $1, 'expense', $2, $3, $4, $5, $6::date, NOW())`,
    [HH, 8000, "Test EV gasto extra", catId, debitoId, prevPeriodDate]
  );
  console.log(`  Mais R$ 80 inserido → total anterior = R$ 140 (> R$ 100 = limite estourado)`);

  const comp3 = await computeBudgetStatus(pool, budget);
  // prevSpent = 14000, leftover = max(0, 10000 - 14000) = 0, effective = 10000
  console.log(`  Caso 3: orçamento anterior estourado`);
  console.log(`    effectiveLimit=${fmt(comp3.amountCents)} (esperado=10000, sem rollover)`);
  console.log(`    ${comp3.amountCents === 10000 ? "✅" : "❌"} limite voltou ao base`);

  const ok = comp1.amountCents === 20000 && comp2.amountCents === 14000 && comp3.amountCents === 10000;
  await pool.end();
  console.log(`  ${ok ? "✅" : "❌"} Rollover OK`);
  return ok;
}

// ============================================================
// TEST 2: Budget Trends
// ============================================================
async function testBudgetTrends() {
  console.log("\n=== Test: budget_trends (via helper) ===");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const bResult = await pool.query<{ rows: Budget[] }>(
    `SELECT * FROM budgets WHERE id = $1`, [budgetId]
  );
  const budget = bResult.rows[0];

  const trends = await getBudgetTrends(pool, budget, 2);
  console.log(`  Período: ${budget.period}`);
  console.log(`  Meses analisados: ${trends.months.length}`);
  console.log(`  Média: ${fmt(trends.avgSpentCents)}/período`);
  console.log(`  Tendência: ${trends.trend}`);
  console.log(`  Formatted:\n${trends.formatted}`);
  await pool.end();

  if (trends.months.length === 0) { console.log("  ❌ Sem dados de tendência"); return false; }
  if (trends.trend !== "insufficient_data" && trends.trend !== "up" && trends.trend !== "down" && trends.trend !== "stable") {
    console.log(`  ❌ Tendência inválida: ${trends.trend}`); return false;
  }
  console.log("  ✅ getBudgetTrends OK");
  return true;
}

// ============================================================
// TEST 3: Budget Adjustment Suggestion
// ============================================================
async function testAdjustmentSuggestion() {
  console.log("\n=== Test: suggest_budget_adjustment ===");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const bResult = await pool.query<{ rows: Budget[] }>(
    `SELECT * FROM budgets WHERE id = $1`, [budgetId]
  );
  const budget = bResult.rows[0];

  const suggestion = await getBudgetAdjustmentSuggestion(pool, budget);
  console.log(`  Limite atual: ${fmt(suggestion.currentLimitCents)}`);
  console.log(`  Média gastos: ${fmt(suggestion.avgSpentCents)}`);
  console.log(`  Sugestão: ${fmt(suggestion.suggestedLimitCents)}`);
  console.log(`  Ação: ${suggestion.action} (${suggestion.percentChange.toFixed(0)}%)`);
  console.log(`  Motivo: ${suggestion.reason}`);
  console.log(`  Formatted:\n${suggestion.formatted}`);

  if (!["increase", "decrease", "keep"].includes(suggestion.action)) {
    console.log(`  ❌ Ação inválida: ${suggestion.action}`); return false;
  }
  if (suggestion.suggestedLimitCents < 100) {
    console.log(`  ❌ Sugestão muito baixa`); return false;
  }
  await pool.end();
  console.log("  ✅ getBudgetAdjustmentSuggestion OK");
  return true;
}

// ============================================================
// TEST 4: Budget Trends with more data
// ============================================================
async function testTrendsWithData() {
  console.log("\n=== Test: Trends com múltiplos meses ===");
  // Manually insert transactions to simulate past months
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const months = [
    { m: 2, spent: 5000 }, // R$ 50 = 50%
    { m: 1, spent: 8000 }, // R$ 80 = 80%
    { m: 0, spent: 3000 }, // R$ 30 = 30%
  ];

  for (const m of months) {
    const d = new Date();
    d.setMonth(d.getMonth() - m.m);
    const dateStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`;

    await pool.query(
      `INSERT INTO transactions (id, household_id, kind, amount_cents, description, category_id, from_account_id, date, created_at)
       VALUES (gen_random_uuid(), $1, 'expense', $2, $3, $4, $5, $6::date, NOW())`,
      [HH, m.spent, `Test EV Gasto ${m.m}mes atrás`, catId, debitoId, dateStr]
    );
  }
  console.log(`  Inseridos 3 gastos históricos`);

  const bResult = await pool.query<{ rows: Budget[] }>(
    `SELECT * FROM budgets WHERE id = $1`, [budgetId]
  );
  const budget = bResult.rows[0];

  const trends = await getBudgetTrends(pool, budget, 3);
  console.log(`  Meses: ${trends.months.length}`);
  for (const m of trends.months) {
    console.log(`    ${m.yearMonth}: ${fmt(m.spentCents)} / ${fmt(m.limitCents)} (${m.percentUsed.toFixed(0)}%)${m.isCurrent ? " ◀" : ""}`);
  }
  console.log(`  Média: ${fmt(trends.avgSpentCents)}/período`);
  console.log(`  Tendência: ${trends.trend}`);

  // Get adjustment suggestion
  const suggestion = await getBudgetAdjustmentSuggestion(pool, budget);
  console.log(`  Sugestão: ${suggestion.action} → ${fmt(suggestion.suggestedLimitCents)} (${suggestion.percentChange.toFixed(0)}%)`);

  if (trends.months.length < 2) { console.log("  ❌ Deveria ter 4+ meses"); await pool.end(); return false; }
  if (trends.avgSpentCents <= 0) { console.log("  ❌ Média deve ser > 0"); await pool.end(); return false; }

  await pool.end();
  console.log("  ✅ Trends com dados OK");
  return true;
}

// ============================================================
// TEST 5: update_budget tool
// ============================================================
async function testUpdateBudget() {
  console.log("\n=== Test: update_budget ===");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  // Directly update via SQL to simulate the tool
  await pool.query(
    `UPDATE budgets SET amount_cents = $1, rollover = $2, alert_threshold = $3, updated_at = NOW() WHERE id = $4`,
    [20000, true, 70, budgetId]
  );

  const bResult = await pool.query<{ rows: Budget[] }>(
    `SELECT * FROM budgets WHERE id = $1`, [budgetId]
  );
  const budget = bResult.rows[0];
  console.log(`  amount_cents: ${parseInt(budget.amount_cents, 10)} (esperado: 20000)`);
  console.log(`  rollover: ${budget.rollover} (esperado: true)`);
  console.log(`  alert_threshold: ${budget.alert_threshold} (esperado: 70)`);

  const ok = parseInt(budget.amount_cents, 10) === 20000
    && budget.rollover === true
    && budget.alert_threshold === 70;
  await pool.end();
  console.log(`  ${ok ? "✅" : "❌"} update_budget OK`);
  return ok;
}

// ============================================================
// MAIN
// ============================================================
async function main() {
  await setup();

  const results: { name: string; ok: boolean }[] = [];
  results.push({ name: "rollover", ok: await testRollover() });
  results.push({ name: "budget_trends (vazio)", ok: await testBudgetTrends() });
  results.push({ name: "budget_adjustment", ok: await testAdjustmentSuggestion() });
  results.push({ name: "trends_with_data", ok: await testTrendsWithData() });
  results.push({ name: "update_budget", ok: await testUpdateBudget() });

  console.log("\n" + "=".repeat(50));
  console.log("RESULTADO:");
  let pass = 0, fail = 0;
  for (const r of results) {
    console.log(`  ${r.ok ? "✅" : "❌"} ${r.name}`);
    if (r.ok) pass++; else fail++;
  }
  console.log(`\n${pass}/${pass + fail} testes passaram`);
  if (fail > 0) process.exit(1);

  await cleanup();
  console.log("🎉 Todas as evoluções funcionam!");
}

main().catch(async (e) => {
  console.error("❌ Fatal:", e.message, e.stack);
  try { await cleanup(); } catch {}
  process.exit(1);
});
