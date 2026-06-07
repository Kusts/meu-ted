import { Pool } from "pg";
process.env.DATABASE_URL = "postgresql://postgres:postgres@host.docker.internal:5432/pi_financeiro";

import {
  createGoal, listGoals, contributeToGoal, cancelGoal,
  createBudget, listBudgets, checkBudgets, refreshGoalsTool,
} from "./tools/goals_budgets";
import { computeGoalProgress, computeBudgetStatus, getCurrentPeriod } from "./tools/goals-budgets";
import { createExpenseTool } from "./tools/create_expense";
import { createCategoryTool } from "./tools/create_category";

// ============================================================
// Test: Goals (metas) + Budgets (orçamentos)
// ============================================================

const HH = "550e8400-e29b-41d4-a716-446655440000";
let debitoId: string;
const catIds: string[] = [];
const goalIds: string[] = [];

function fmt(c: number) { return `R$ ${(c / 100).toFixed(2)}`; }
function pad(n: number) { return n < 10 ? "0" + n : "" + n; }
function today() { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function future(days: number) { const d = new Date(Date.now() + days * 86400000); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

async function setup() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const ts = Date.now();
  // Clean old test data
  await pool.query(`DELETE FROM goal_contributions WHERE notes LIKE 'Test GB%'`);
  await pool.query(`DELETE FROM goals WHERE name LIKE 'Test GB%'`);
  await pool.query(`DELETE FROM budgets WHERE name LIKE 'Test GB%'`);
  await pool.query(`DELETE FROM transactions WHERE description LIKE 'Test GB%'`);
  // Create account
  const r = await pool.query(
    `INSERT INTO accounts (id, household_id, name, name_normalized, initial_balance_cents, active, created_at)
     VALUES (gen_random_uuid(), $1, $2, LOWER(UNACCENT($2)), 10000000, true, NOW()) RETURNING id`,
    [HH, `Conta GB ${ts}`]
  );
  debitoId = r.rows[0].id;
  await pool.query(`DELETE FROM categories WHERE name LIKE 'Test GB%' AND household_id = $1`, [HH]);
  await pool.end();
  console.log(`✅ Setup: conta ${debitoId.slice(0, 8)} criada`);
}

async function cleanup() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  await pool.query(`DELETE FROM goal_contributions WHERE notes LIKE 'Test GB%'`);
  await pool.query(`DELETE FROM goals WHERE name LIKE 'Test GB%'`);
  await pool.query(`DELETE FROM budgets WHERE name LIKE 'Test GB%'`);
  await pool.query(`DELETE FROM transactions WHERE description LIKE 'Test GB%'`);
  await pool.query(`DELETE FROM categories WHERE name LIKE 'Test GB%' AND household_id = $1`, [HH]);
  await pool.query(`DELETE FROM accounts WHERE id = $1`, [debitoId]);
  await pool.end();
  console.log(`✅ Cleanup concluído`);
}

// Tool helper (some tools need 4-arg execute)
function exec(tool: any, params: any) {
  const ctrl = new AbortController();
  return tool.execute("", params, ctrl.signal, undefined);
}

// === HELPERS ===
function testGetCurrentPeriod() {
  console.log("\n--- Helper: getCurrentPeriod ---");
  const p1 = getCurrentPeriod("monthly", "2026-01-15", "2026-06-15");
  console.log(`  monthly (2026-06-15): ${p1.start} → ${p1.end} (${p1.daysTotal}d, ${p1.daysRemaining} remaining)`);
  const pass1 = p1.start === "2026-05-15" && p1.end === "2026-06-15";
  console.log(`  ${pass1 ? "✅" : "❌"} esperado: 2026-05-15 → 2026-06-15`);

  const p2 = getCurrentPeriod("weekly", "2026-06-01", "2026-06-15");
  console.log(`  weekly (2026-06-15): ${p2.start} → ${p2.end} (${p2.daysTotal}d, ${p2.daysRemaining} remaining)`);
  const pass2 = p2.start === "2026-06-08" && p2.end === "2026-06-15";
  console.log(`  ${pass2 ? "✅" : "❌"} esperado: 2026-06-08 → 2026-06-15`);

  return pass1 && pass2;
}

function testComputeGoalProgress() {
  console.log("\n--- Helper: computeGoalProgress ---");
  const base = {
    id: "1", household_id: HH, name: "X", description: null,
    goal_type: "savings" as const, target_amount_cents: "1000000",
    current_amount_cents: "500000", start_date: "2026-01-01",
    target_date: null, category_id: null, account_id: null,
    status: "active" as const, achieved_at: null, notes: null,
  };
  const p1 = computeGoalProgress(base);
  console.log(`  Sem prazo 50%: ${p1.progressPercent.toFixed(1)}% status=${p1.status}`);
  const pass1 = p1.status === "on_track";

  const g2 = { ...base, current_amount_cents: "200000", target_date: "2026-12-31" };
  const p2 = computeGoalProgress(g2);
  console.log(`  Com prazo 20%: ${p2.progressPercent.toFixed(1)}% (expected ${p2.expectedProgressPercent.toFixed(1)}%) status=${p2.status}`);
  const pass2 = p2.status === "behind";

  const g3 = { ...base, current_amount_cents: "900000", target_date: "2026-12-31" };
  const p3 = computeGoalProgress(g3);
  console.log(`  90% adiantado: status=${p3.status}`);
  const pass3 = p3.status === "ahead";

  return pass1 && pass2 && pass3;
}

// === GOALS ===
async function testCreateGoals() {
  console.log("\n--- Test: create_goal (3 tipos) ---");
  let ok = 0;

  const r1 = await createGoal.execute({ householdId: HH, name: "Test GB Reserva",
    goalType: "emergency_fund", targetAmountCents: 500000, startDate: today(), targetDate: future(365) });
  console.log(`  emergency_fund: ${r1.success ? "✅" : "❌"} monthly=${fmt(r1.monthlyRequiredCents)}`);
  goalIds.push(r1.goalId);
  if (r1.success) ok++;

  const r2 = await createGoal.execute({ householdId: HH, name: "Test GB Viagem",
    goalType: "purchase", targetAmountCents: 1000000, startDate: today() });
  console.log(`  purchase (sem prazo): ${r2.success ? "✅" : "❌"} status=${r2.status}`);
  goalIds.push(r2.goalId);
  if (r2.success) ok++;

  const r3 = await createGoal.execute({ householdId: HH, name: "Test GB Quitar",
    goalType: "debt_payoff", targetAmountCents: 200000, startDate: today(), targetDate: future(60) });
  console.log(`  debt_payoff: ${r3.success ? "✅" : "❌"}`);
  goalIds.push(r3.goalId);
  if (r3.success) ok++;

  return ok === 3;
}

async function testContribute() {
  console.log("\n--- Test: contribute_to_goal ---");
  const r1 = await contributeToGoal.execute({ householdId: HH, goalId: goalIds[0], amountCents: 100000, notes: "Test GB aporte" });
  console.log(`  +R$ 1.000: ${r1.success ? "✅" : "❌"} ${r1.progressPercent.toFixed(1)}% ${r1.message}`);

  const r2 = await contributeToGoal.execute({ householdId: HH, goalId: goalIds[0], amountCents: 400000 });
  console.log(`  +R$ 4.000: ${r2.success ? "✅" : "❌"} ${r2.progressPercent.toFixed(1)}% achieved=${r2.achieved}`);

  return r1.success && r2.success && r2.achieved;
}

async function testListGoals() {
  console.log("\n--- Test: list_goals ---");
  const r = await listGoals.execute({ householdId: HH });
  console.log(`  Total: ${r.total} metas`);
  console.log(`  Has message: ${r.message?.length > 50 ? "✅" : "❌"}`);
  return r.total >= 2;
}

async function testRefreshGoals() {
  console.log("\n--- Test: refresh_goals ---");
  const r = await refreshGoalsTool.execute({ householdId: HH });
  console.log(`  Checked: ${r.checked} Achieved: ${r.achieved}`);
  return r.checked >= 1;
}

async function testCancelGoal() {
  console.log("\n--- Test: cancel_goal ---");
  const r = await cancelGoal.execute({ householdId: HH, goalId: goalIds[1], reason: "Mudei de plano" });
  console.log(`  ${r.success ? "✅" : "❌"} ${r.message}`);
  return r.success;
}

// === BUDGETS ===
async function testCreateBudget() {
  console.log("\n--- Test: create_budget ---");
  const catName = `Test GB Restaurante ${Date.now()}`;
  const cat = await exec(createCategoryTool, { householdId: HH, name: catName, kind: "expense" });
  const catId = cat.details?.category_id;
  catIds.push(catId);
  console.log(`  Categoria: ${catId ? "✅" : "❌"} ${catId?.slice(0, 8)}`);

  const r = await createBudget.execute({
    householdId: HH, categoryId: catId, name: "Budget Restaurante",
    amountCents: 50000, period: "monthly", startDate: today(),
  });
  console.log(`  ${r.success ? "✅" : "❌"} ${r.message}`);
  if (!r.success) return false;

  // Duplicate check
  const r2 = await createBudget.execute({
    householdId: HH, categoryId: catId, name: "Outro",
    amountCents: 99999, period: "monthly", startDate: today(),
  });
  console.log(`  Duplicata: ${r2.error === "budget_exists" ? "✅" : "❌"} (${r2.error})`);
  return r.success && r2.error === "budget_exists";
}

async function testBudgetAlerts() {
  console.log("\n--- Test: budget alerts (90% do limite) ---");
  for (let i = 0; i < 3; i++) {
    await exec(createExpenseTool, {
      householdId: HH, accountId: debitoId, categoryId: catIds[0],
      description: `Test GB Almoço ${i}`, amountCents: 15000, date: today(), force: true,
    });
  }
  console.log(`  3 expenses criadas (R$ 450 / R$ 500)`);

  const r = await checkBudgets.execute({ householdId: HH });
  console.log(`  Alert count: ${r.alertCount} total=${fmt(r.totalSpentCents)}`);
  if (r.alerts.length > 0) {
    const a = r.alerts[0];
    console.log(`  ${a.status} ${a.percentUsed.toFixed(1)}% daily=${fmt(a.dailyAllowance)} restante=${fmt(a.remainingCents)}`);
  }
  return r.totalSpentCents >= 45000;
}

async function testListBudgets() {
  console.log("\n--- Test: list_budgets ---");
  const r = await listBudgets.execute({ householdId: HH });
  console.log(`  Total: ${r.total} orçamentos`);
  console.log(`  ${r.message}`);
  return r.total >= 1;
}

async function testBudgetExceeded() {
  console.log("\n--- Test: budget exceeded (estourado) ---");
  await exec(createExpenseTool, {
    householdId: HH, accountId: debitoId, categoryId: catIds[0],
    description: "Test GB Jantar", amountCents: 20000, date: today(), force: true,
  });
  const r = await checkBudgets.execute({ householdId: HH });
  console.log(`  Alert count: ${r.alertCount} total=${fmt(r.totalSpentCents)}`);
  if (r.alerts.length > 0) {
    const a = r.alerts[0];
    console.log(`  Status: ${a.status} | ${a.percentUsed.toFixed(1)}% | daily=${fmt(a.dailyAllowance)}`);
  }
  return r.alertCount >= 1;
}

async function testWeeklyBudget() {
  console.log("\n--- Test: weekly budget ---");
  const catName = `Test GB Lazer ${Date.now()}`;
  const cat = await exec(createCategoryTool, { householdId: HH, name: catName, kind: "expense" });
  const catId = cat.details?.category_id;
  catIds.push(catId);
  console.log(`  Categoria: ${catId ? "✅" : "❌"}`);

  const r = await createBudget.execute({
    householdId: HH, categoryId: catId, name: "Budget Lazer",
    amountCents: 10000, period: "weekly", startDate: today(),
  });
  console.log(`  ${r.success ? "✅" : "❌"} ${r.success ? r.message : r.error}`);

  const list = await listBudgets.execute({ householdId: HH });
  const wk = list.items?.find((i: any) => i.period === "weekly");
  console.log(`  Weekly found: ${wk ? "✅" : "❌"} status=${wk?.status || "N/A"}`);
  return r.success && wk?.status;
}

// ============================================================
// MAIN
// ============================================================
async function main() {
  await setup();

  const results: { name: string; ok: boolean }[] = [];

  results.push({ name: "getCurrentPeriod", ok: testGetCurrentPeriod() });
  results.push({ name: "computeGoalProgress", ok: testComputeGoalProgress() });

  results.push({ name: "create_goal", ok: await testCreateGoals() });
  results.push({ name: "contribute_to_goal", ok: await testContribute() });
  results.push({ name: "list_goals", ok: await testListGoals() });
  results.push({ name: "refresh_goals", ok: await testRefreshGoals() });
  results.push({ name: "cancel_goal", ok: await testCancelGoal() });

  results.push({ name: "create_budget", ok: await testCreateBudget() });
  results.push({ name: "budget_alerts_90", ok: await testBudgetAlerts() });
  results.push({ name: "list_budgets", ok: await testListBudgets() });
  results.push({ name: "budget_exceeded", ok: await testBudgetExceeded() });
  results.push({ name: "weekly_budget", ok: await testWeeklyBudget() });

  console.log("\n" + "=".repeat(50));
  console.log("RESULTADO FINAL:");
  let pass = 0, fail = 0;
  for (const r of results) {
    console.log(`  ${r.ok ? "✅" : "❌"} ${r.name}`);
    if (r.ok) pass++; else fail++;
  }
  console.log(`\n${pass}/${fail ? fail + pass : pass} testes passaram`);
  if (fail > 0) process.exit(1);

  await cleanup();
  console.log("\n🎉 Todos os testes passaram!");
}

main().catch(async (e) => {
  console.error("❌ Fatal:", e.message);
  try { await cleanup(); } catch {}
  process.exit(1);
});
