/**
 * Smoke test — dynamic imports, checks all tools work at runtime.
 */
import { Pool } from "pg";
process.env.DATABASE_URL = "postgresql://postgres:postgres@host.docker.internal:5432/pi_financeiro";

const HH = "550e8400-e29b-41d4-a716-446655440000";
const TAG = `smoke${Date.now()}`;

function pad(n: number) { return n < 10 ? "0" + n : "" + n; }
function today() { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function future(d: number) { const dt = new Date(Date.now() + d * 86400000); return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`; }
function fmt(c: number) { return `R$ ${(c / 100).toFixed(2)}`; }

// Load tool with retry (handles .js vs .ts extension)
async function load(mod: string): Promise<any> {
  try { return await import(`./tools/${mod}`); }
  catch { return await import(`./tools/${mod}.js`); }
}

const results: { name: string; ok: boolean; err?: string }[] = [];
async function t(name: string, fn: () => Promise<void>) {
  try { await fn(); results.push({ name, ok: true }); }
  catch (e: any) { results.push({ name, ok: false, err: e.message }); }
}
function expect(cond: any, msg: string) { if (!cond) throw new Error(`assert: ${msg}`); }

async function main() {
  // Clean slate
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  await pool.query(`DELETE FROM goal_contributions WHERE notes LIKE '${TAG}%'`);
  await pool.query(`DELETE FROM goals WHERE name LIKE '${TAG}%'`);
  await pool.query(`DELETE FROM budgets WHERE name LIKE '${TAG}%'`);
  // Delete transactions from old test runs (clean both description-based and account-based)
  await pool.query(`DELETE FROM transactions WHERE from_account_id IN (SELECT id FROM accounts WHERE name LIKE 'smoke%') OR to_account_id IN (SELECT id FROM accounts WHERE name LIKE 'smoke%')`);
  await pool.query(`DELETE FROM transactions WHERE description LIKE 'smoke%'`);
  await pool.query(`DELETE FROM transactions WHERE description LIKE '${TAG}%'`);
  await pool.query(`DELETE FROM installment_plans WHERE description LIKE '${TAG}%'`);
  await pool.query(`DELETE FROM recurring_purchases WHERE description LIKE '${TAG}%'`);
  await pool.query(`DELETE FROM accounts_payable WHERE description LIKE '${TAG}%'`);
  await pool.query(`DELETE FROM account_payable_templates WHERE name LIKE '${TAG}%'`);
  await pool.query(`DELETE FROM statements WHERE account_id IN (SELECT id FROM accounts WHERE name LIKE '${TAG}%')`);
  await pool.query(`DELETE FROM notification_settings WHERE household_id = $1`, [HH]);
  await pool.query(`DELETE FROM notification_log WHERE household_id = $1`, [HH]);
  await pool.query(`DELETE FROM categories WHERE name LIKE '${TAG}%'`);
  await pool.query(`DELETE FROM accounts WHERE name LIKE '${TAG}%'`);
  await pool.end();

  // Load all tools dynamically
  const T: Record<string, any> = {};
  async function get(mod: string, name: string) {
    const m = await load(mod);
    const t = m[name] || m[Object.keys(m).find(k => k.toLowerCase().includes(name.toLowerCase())) as string];
    if (!t) throw new Error(`Tool ${name} not found in ${mod} (exports: ${Object.keys(m).join(",")})`);
    return t;
  }

  // Setup accounts and categories
  const cAcct = await get("create_account", "createAccountTool");
  const cCardAcct = await get("create_credit_card_account", "createCreditCardAccount");
  const cCat = await get("create_category", "createCategoryTool");

  function exec(t: any, p: any) {
    if (t.execute.length >= 3) {
      const ctl = new AbortController();
      return t.execute("", p, ctl.signal, undefined);
    }
    return t.execute(p);
  }

  T.acc1 = (await exec(cAcct, { householdId: HH, name: `${TAG} acc1`, initialBalanceCents: 500000 })).details.account_id;
  T.acc2 = (await exec(cAcct, { householdId: HH, name: `${TAG} acc2`, initialBalanceCents: 0 })).details.account_id;
  const cr = await exec(cCardAcct, { householdId: HH, name: `${TAG} card`, creditLimitCents: 200000, closingDay: Math.floor(Math.random() * 28) + 1, dueDay: Math.floor(Math.random() * 28) + 1, force: true });
  T.accCard = cr.id || cr.details?.account_id;
  T.cat1 = (await exec(cCat, { householdId: HH, name: `${TAG} cat1`, kind: "expense" })).details.category_id;
  T.cat2 = (await exec(cCat, { householdId: HH, name: `${TAG} cat2`, kind: "expense" })).details.category_id;
  console.log(`✅ Setup: ${T.acc1.slice(0,8)} ${T.acc2.slice(0,8)} card=${(T.accCard||"").slice(0,8)} cat1=${T.cat1.slice(0,8)}`);

  // === A. TRANSACTIONS ===
  await t("create_expense", async () => {
    const tool = await get("create_expense", "createExpenseTool");
    const r = await exec(tool, { householdId: HH, accountId: T.acc1, categoryId: T.cat1, description: `${TAG} almoço`, amountCents: 5000, date: today() });
    expect(r.success, `create_expense: ${r.error}`);
    T.tx1 = r.transactionId;
  });

  await t("create_income", async () => {
    const tool = await get("create_income", "createIncomeTool");
    const r = await exec(tool, { householdId: HH, accountId: T.acc1, categoryId: T.cat2, description: `${TAG} salário`, amountCents: 100000, date: today() });
    expect(r.success, `create_income: ${r.error}`);
    T.tx2 = r.transactionId;
  });

  await t("create_transfer", async () => {
    const tool = await get("create_transfer", "createTransferTool");
    const r = await exec(tool, { householdId: HH, fromAccountId: T.acc1, toAccountId: T.acc2, amountCents: 2000, description: `${TAG} pix`, date: today() });
    expect(r.success, `transfer: ${r.error}`);
  });

  await t("get_balance", async () => {
    const tool = await get("get_balance", "getBalanceTool");
    const r = await exec(tool, { accountId: T.acc1, householdId: HH });
    expect(typeof r.balanceCents === "number", `balance: ${JSON.stringify(r)}`);
  });

  await t("get_month_summary", async () => {
    const tool = await get("get_month_summary", "getMonthSummaryTool");
    const r = await exec(tool, { householdId: HH, yearMonth: today().slice(0, 7) });
    expect(typeof r.incomeCents === "number", `summary: ${r.error}`);
  });

  await t("list_recent_transactions", async () => {
    const tool = await get("list_recent_transactions", "listRecentTransactionsTool");
    const r = await exec(tool, { householdId: HH, limit: 5 });
    expect(Array.isArray(r.transactions), `list: ${r.error}`);
  });

  await t("list_accounts", async () => {
    const tool = await get("list_accounts", "listAccountsTool");
    const r = await exec(tool, { householdId: HH });
    expect(Array.isArray(r.accounts), `list: ${r.error}`);
  });

  await t("list_categories", async () => {
    const tool = await get("list_categories", "listCategoriesTool");
    const r = await exec(tool, { householdId: HH });
    expect(Array.isArray(r.categories), `list: ${r.error}`);
  });

  await t("update_transaction", async () => {
    const tool = await get("update_transaction", "updateTransactionTool");
    const r = await exec(tool, { transactionId: T.tx1, householdId: HH, description: `${TAG} updated` });
    expect(r.success, `update: ${r.error}`);
  });

  await t("delete_transaction", async () => {
    const tool = await get("delete_transaction", "deleteTransactionTool");
    const r = await exec(tool, { transactionId: T.tx1, householdId: HH });
    expect(r.success, `delete: ${r.error}`);
  });

  await t("undo_last_action", async () => {
    const tool = await get("undo_last_action", "undoLastActionTool");
    const r = await exec(tool, { householdId: HH });
    expect(r.success || (r.message||"").includes("Nothing"), `undo: ${r.error || r.message}`);
  });

  // === B. CREDIT CARD ===
  await t("create_card_purchase", async () => {
    const tool = await get("create_card_purchase", "createCardPurchase");
    const r = await exec(tool, { householdId: HH, accountId: T.accCard, description: `${TAG} compra`, amountCents: 5000, date: today(), categoryId: T.cat1 });
    expect(r.success, `card purchase: ${r.error}`);
  });

  await t("create_card_installments", async () => {
    const tool = await get("create_card_installments", "createCardInstallments");
    const r = await exec(tool, { householdId: HH, accountId: T.accCard, description: `${TAG} 3x`, totalAmountCents: 9000, purchaseDate: today(), installmentsTotal: 3, categoryId: T.cat1 });
    expect(r.success, `card installments: ${r.error}`);
  });

  await t("list_statements", async () => {
    const tool = await get("list_statements", "listStatements");
    const r = await exec(tool, { householdId: HH, accountId: T.accCard });
    expect(Array.isArray(r.statements), `list stmts: ${r.error}`);
    if (r.statements.length > 0) T.sid = r.statements[0].id;
  });

  await t("get_statement_details", async () => {
    if (!T.sid) { throw new Error("skip"); }
    const tool = await get("get_statement_details", "getStatementDetails");
    const r = await exec(tool, { householdId: HH, statementId: T.sid });
    expect(r.success, `details: ${r.error}`);
  });

  await t("pay_statement", async () => {
    if (!T.sid) { throw new Error("skip"); }
    const tool = await get("pay_statement", "payStatement");
    const r = await exec(tool, { householdId: HH, statementId: T.sid, amountCents: 100, fromAccountId: T.acc1 });
    expect(r.success, `pay: ${r.error}`);
  });

  await t("card_insights", async () => {
    const tool = await get("card_insights", "cardInsights");
    const r = await exec(tool, { householdId: HH });
    expect(r.success, `insights: ${r.error}`);
  });

  await t("check_card_limits", async () => {
    const tool = await get("check_card_limits", "checkCardLimits");
    const r = await exec(tool, { householdId: HH });
    expect(r.success, `limits: ${r.error}`);
  });

  await t("refresh_statements", async () => {
    const tool = await get("refresh_statements", "refreshStatements");
    const r = await exec(tool, { householdId: HH });
    expect(r.success, `refresh: ${r.error}`);
  });

  // === C. RECURRING ===
  await t("create_recurring_purchase", async () => {
    const tool = (await load("create_recurring_purchase"));
    const r = await tool.createRecurringPurchase.execute({ householdId: HH, accountId: T.acc1, description: `${TAG} netflix`, amountCents: 5500, frequency: "monthly", startDate: today(), categoryId: T.cat2 });
    expect(r.success, `recurring: ${r.error}`);
  });

  await t("list_recurring_purchases", async () => {
    const tool = (await load("create_recurring_purchase"));
    const r = await tool.listRecurringPurchases.execute({ householdId: HH });
    expect(r.success, `list: ${r.error}`);
  });

  await t("post_due_recurring", async () => {
    const tool = (await load("create_recurring_purchase"));
    const r = await tool.postDueRecurring.execute({ householdId: HH });
    expect(r.success, `post: ${r.error}`);
  });

  // === D. SPENDING ===
  await t("spending_insights", async () => {
    const tool = (await load("spending_insights"));
    const r = await tool.spendingInsights.execute({ householdId: HH, yearMonth: today().slice(0, 7) });
    expect(r.success, `spending: ${r.error}`);
  });

  // === E. INSTALLMENTS ===
  await t("create_installment_plan", async () => {
    const tool = (await load("create_installment_plan"));
    const r = await tool.createInstallmentPlan.execute({ householdId: HH, accountId: T.acc1, description: `${TAG} financiamento`, totalAmountCents: 240000, installmentsCount: 12, type: "out_of_card", firstDueDate: future(30), interestRate: 0.02, categoryId: T.cat1 });
    expect(r.success, `plan: ${r.error}`);
    if (r.planId) T.planId = r.planId;
  });

  await t("list_installment_plans", async () => {
    const tool = (await load("create_installment_plan"));
    const r = await tool.listInstallmentPlans.execute({ householdId: HH });
    expect(r.success, `list: ${r.error}`);
  });

  await t("pay_installment", async () => {
    const tool = (await load("pay_installment"));
    const plans = await tool.listDueInstallments.execute({ householdId: HH });
    if (plans.installments?.length > 0) {
      const r = await tool.payInstallment.execute({ householdId: HH, transactionId: plans.installments[0].transactionId });
      expect(r.success, `pay: ${r.error}`);
    }
  });

  await t("list_due_installments", async () => {
    const tool = (await load("pay_installment"));
    const r = await tool.listDueInstallments.execute({ householdId: HH });
    expect(r.success, `due: ${r.error}`);
  });

  await t("check_due_soon", async () => {
    const tool = (await load("pay_installment"));
    const r = await tool.checkDueSoon.execute({ householdId: HH });
    expect(r.success, `check: ${r.error}`);
  });

  await t("simulate_prepayment", async () => {
    if (!T.planId) { throw new Error("skip"); }
    const tool = (await load("prepay_installments"));
    const r = await tool.simulatePrepayment.execute({ householdId: HH, planId: T.planId, numberOfInstallments: 6, discountRate: 0.05 });
    expect(r.success, `simulate: ${r.error}`);
  });

  await t("prepay_installments", async () => {
    if (!T.planId) { throw new Error("skip"); }
    const tool = (await load("prepay_installments"));
    const r = await tool.prepayInstallments.execute({ householdId: HH, planId: T.planId, numberOfInstallments: 3, discountRate: 0.05 });
    expect(r.success, `prepay: ${r.error}`);
  });

  await t("installment_score", async () => {
    const tool = (await load("installment_score"));
    const r = await tool.installmentScore.execute({ householdId: HH });
    expect(r.success, `score: ${r.error}`);
  });

  // === F. ACCOUNTS PAYABLE ===
  await t("create_account_payable", async () => {
    const tool = (await load("accounts_payable"));
    const r = await tool.createAccountPayable.execute({ householdId: HH, accountId: T.acc1, description: `${TAG} conta`, amountCents: 15000, dueDate: future(10), type: "one_time", categoryId: T.cat1 });
    expect(r.success, `payable: ${r.error}`);
    if (r.payableId) T.payId = r.payableId;
  });

  await t("create_account_payable_recurring", async () => {
    const tool = (await load("accounts_payable"));
    const r = await tool.createAccountPayable.execute({ householdId: HH, accountId: T.acc1, description: `${TAG} luz`, amountCents: 5000, dueDate: future(5), type: "recurring", frequency: "monthly", categoryId: T.cat2 });
    expect(r.success, `recurring: ${r.error}`);
  });

  await t("list_accounts_payable", async () => {
    const tool = (await load("accounts_payable"));
    const r = await tool.listAccountsPayable.execute({ householdId: HH });
    expect(r.success, `list: ${r.error}`);
  });

  await t("check_payable_reminders", async () => {
    const tool = (await load("accounts_payable"));
    const r = await tool.checkPayableReminders.execute({ householdId: HH });
    expect(r.success, `reminders: ${r.error}`);
  });

  await t("refresh_payable_status", async () => {
    const tool = (await load("accounts_payable"));
    const r = await tool.refreshPayableStatus.execute({ householdId: HH });
    expect(r.success, `refresh: ${r.error}`);
  });

  await t("mark_account_paid", async () => {
    if (!T.payId) { throw new Error("skip"); }
    const tool = (await load("accounts_payable"));
    const r = await tool.markAccountPaid.execute({ householdId: HH, payableId: T.payId });
    expect(r.success, `mark paid: ${r.error}`);
  });

  await t("cancel_account_payable", async () => {
    const tool = (await load("accounts_payable"));
    // Find a pending one to cancel
    const list = await tool.listAccountsPayable.execute({ householdId: HH });
    const pending = (list.payables || []).find((p: any) => p.status === "pending");
    if (pending) {
      const r = await tool.cancelAccountPayable.execute({ householdId: HH, payableId: pending.id });
      expect(r.success, `cancel: ${r.error}`);
    }
  });

  // === G. TEMPLATES ===
  await t("create_payable_template", async () => {
    const tool = (await load("payable_templates"));
    const r = await tool.createPayableTemplate.execute({ householdId: HH, accountId: T.acc1, name: `${TAG} template`, description: `${TAG} netflix`, amountCents: 5500, frequency: "monthly", dayOfMonth: 15 });
    expect(r.success, `template: ${r.error}`);
    if (r.templateId) T.tplId = r.templateId;
  });

  await t("list_payable_templates", async () => {
    const tool = (await load("payable_templates"));
    const r = await tool.listPayableTemplates.execute({ householdId: HH });
    expect(r.success, `list: ${r.error}`);
  });

  await t("create_payable_from_template", async () => {
    if (!T.tplId) { throw new Error("skip"); }
    const tool = (await load("payable_templates"));
    const r = await tool.createPayableFromTemplate.execute({ householdId: HH, templateId: T.tplId, dueDate: future(15) });
    expect(r.success, `from template: ${r.error}`);
  });

  await t("auto_create_from_templates", async () => {
    const tool = (await load("payable_templates"));
    const r = await tool.autoCreateFromTemplates.execute({ householdId: HH });
    expect(r.success, `auto: ${r.error}`);
  });

  // === H. ANALYTICS ===
  await t("payment_score", async () => {
    const tool = (await load("payment_score"));
    const r = await tool.paymentScore.execute({ householdId: HH });
    expect(r.success, `score: ${r.error}`);
  });

  await t("monthly_projection", async () => {
    const tool = (await load("monthly_projection"));
    const r = await tool.monthlyProjection.execute({ householdId: HH, yearMonth: today().slice(0, 7) });
    expect(r.success, `projection: ${r.error}`);
  });

  await t("check_price_alerts", async () => {
    const tool = (await load("price-alerts"));
    const r = await tool.checkPriceAlerts.execute({ householdId: HH });
    expect(r.success, `price: ${r.error}`);
  });

  // === I. NOTIFICATIONS ===
  await t("configure_notification", async () => {
    const tool = (await load("notification_tools"));
    const r = await tool.configureNotification.execute({ householdId: HH, chatId: "test-chat", notificationType: "due_today_reminder", enabled: true, scheduleHour: 8 });
    expect(r.success, `configure: ${r.error}`);
  });

  await t("list_notifications", async () => {
    const tool = (await load("notification_tools"));
    const r = await tool.listNotifications.execute({ householdId: HH, chatId: "test-chat" });
    expect(r.success, `list: ${r.error}`);
  });

  await t("test_notification", async () => {
    const tool = (await load("notification_tools"));
    const r = await tool.testNotification.execute({ householdId: HH, notificationType: "due_today_reminder" });
    expect(r.success, `test: ${r.error}`);
  });

  await t("process_notifications", async () => {
    const tool = (await load("notification_tools"));
    const r = await tool.processNotifications.execute({ householdId: HH, dryRun: true });
    expect(r.success, `process: ${r.error}`);
  });

  await t("get_notification_log", async () => {
    const tool = (await load("notification_tools"));
    const r = await tool.getNotificationLog.execute({ householdId: HH, limit: 5 });
    expect(r.success, `log: ${r.error}`);
  });

  // === J. GOALS ===
  await t("create_goal", async () => {
    const tool = (await load("goals_budgets"));
    const r = await tool.createGoal.execute({ householdId: HH, name: `${TAG} reserve`, goalType: "emergency_fund", targetAmountCents: 100000, startDate: today(), targetDate: future(365) });
    expect(r.success, `goal: ${r.error}`);
    T.goalId = r.goalId;
  });

  await t("contribute_to_goal", async () => {
    if (!T.goalId) { throw new Error("skip"); }
    const tool = (await load("goals_budgets"));
    const r = await tool.contributeToGoal.execute({ householdId: HH, goalId: T.goalId, amountCents: 5000, notes: `${TAG} aporte` });
    expect(r.success, `contribute: ${r.error}`);
  });

  await t("list_goals", async () => {
    const tool = (await load("goals_budgets"));
    const r = await tool.listGoals.execute({ householdId: HH });
    expect(r.success, `list goals: ${r.error}`);
  });

  await t("refresh_goals", async () => {
    const tool = (await load("goals_budgets"));
    const r = await tool.refreshGoalsTool.execute({ householdId: HH });
    expect(r.success, `refresh: ${r.error}`);
  });

  await t("cancel_goal", async () => {
    if (!T.goalId) { throw new Error("skip"); }
    const tool = (await load("goals_budgets"));
    const r = await tool.cancelGoal.execute({ householdId: HH, goalId: T.goalId, reason: "test" });
    expect(r.success, `cancel: ${r.error}`);
  });

  // === K. BUDGETS ===
  await t("create_budget", async () => {
    const tool = (await load("goals_budgets"));
    const r = await tool.createBudget.execute({ householdId: HH, categoryId: T.cat1, name: `${TAG} budget`, amountCents: 50000, period: "monthly", startDate: today() });
    expect(r.success, `budget: ${r.error}`);
    T.budgetId = r.budgetId;
  });

  await t("list_budgets", async () => {
    const tool = (await load("goals_budgets"));
    const r = await tool.listBudgets.execute({ householdId: HH });
    expect(r.success, `list: ${r.error}`);
  });

  await t("check_budgets", async () => {
    const tool = (await load("goals_budgets"));
    const r = await tool.checkBudgets.execute({ householdId: HH });
    expect(r.success, `check: ${r.error}`);
  });

  await t("budget_trends", async () => {
    if (!T.budgetId) { throw new Error("skip"); }
    const tool = (await load("goals_budgets"));
    const r = await tool.budgetTrendsTool.execute({ householdId: HH, budgetId: T.budgetId });
    expect(r.success, `trends: ${r.error}`);
  });

  await t("suggest_budget_adjustment", async () => {
    if (!T.budgetId) { throw new Error("skip"); }
    const tool = (await load("goals_budgets"));
    const r = await tool.suggestBudgetAdjustmentTool.execute({ householdId: HH, budgetId: T.budgetId });
    expect(r.success, `suggest: ${r.error}`);
  });

  await t("update_budget", async () => {
    if (!T.budgetId) { throw new Error("skip"); }
    const tool = (await load("goals_budgets"));
    const r = await tool.updateBudgetTool.execute({ householdId: HH, budgetId: T.budgetId, amountCents: 60000 });
    expect(r.success, `update: ${r.error}`);
  });

  // === REPORT ===
  console.log("\n" + "=".repeat(70));
  const groups: Record<string, {ok:number; fail:number; fails:string[]}> = {};
  for (const r of results) {
    const g = r.name.startsWith("skip") ? "_" : r.name[0];
    if (!groups[g]) groups[g] = { ok:0, fail:0, fails:[] };
    if (r.ok) groups[g].ok++;
    else { groups[g].fail++; groups[g].fails.push(`${r.name}: ${r.err}`); }
  }
  let tOk=0, tFail=0;
  const labels: Record<string,string> = { A:"Transações",B:"Cartão",C:"Recorrências",D:"Spending",E:"Parcelamento",F:"Contas a Pagar",G:"Templates",H:"Analytics",I:"Notificações",J:"Metas",K:"Orçamentos" };
  for (const [k,v] of Object.entries(groups)) {
    console.log(`  [${k}] ${labels[k]||"?"}: ${v.ok}✅ ${v.fail}❌`);
    for (const f of v.fails) console.log(`    ❌ ${f}`);
    tOk += v.ok; tFail += v.fail;
  }
  console.log(`\nTOTAL: ${tOk}/${tOk+tFail} (${((tOk/(tOk+tFail||1))*100).toFixed(0)}%)`);
  if (tFail > 0) process.exit(1);

  // Cleanup
  const pool2 = new Pool({ connectionString: process.env.DATABASE_URL });
  await pool2.query(`DELETE FROM goal_contributions WHERE notes LIKE '${TAG}%'`);
  await pool2.query(`DELETE FROM goals WHERE name LIKE '${TAG}%'`);
  await pool2.query(`DELETE FROM budgets WHERE name LIKE '${TAG}%'`);
  // Delete ALL transactions from our test accounts (some have synthetic descriptions)
  await pool2.query(`DELETE FROM transactions WHERE from_account_id IN (SELECT id FROM accounts WHERE name LIKE '${TAG}%') OR to_account_id IN (SELECT id FROM accounts WHERE name LIKE '${TAG}%')`);
  await pool2.query(`DELETE FROM transactions WHERE description LIKE '${TAG}%'`);
  await pool2.query(`DELETE FROM transactions WHERE description LIKE 'Pagamento fatura%' AND from_account_id IN (SELECT id FROM accounts WHERE name LIKE '${TAG}%')`);
  await pool2.query(`DELETE FROM installment_plans WHERE description LIKE '${TAG}%'`);
  await pool2.query(`DELETE FROM recurring_purchases WHERE description LIKE '${TAG}%'`);
  await pool2.query(`DELETE FROM accounts_payable WHERE description LIKE '${TAG}%'`);
  await pool2.query(`DELETE FROM account_payable_templates WHERE name LIKE '${TAG}%'`);
  await pool2.query(`DELETE FROM statements WHERE account_id IN (SELECT id FROM accounts WHERE name LIKE '${TAG}%')`);
  await pool2.query(`DELETE FROM notification_settings WHERE household_id = $1`, [HH]);
  await pool2.query(`DELETE FROM notification_log WHERE household_id = $1`, [HH]);
  await pool2.query(`DELETE FROM categories WHERE name LIKE '${TAG}%'`);
  await pool2.query(`DELETE FROM accounts WHERE name LIKE '${TAG}%'`);
  await pool2.end();
  console.log("🎉 Todos os testes passaram!");
}

main().catch(e => { console.error("💥", e.message); process.exit(1); });
