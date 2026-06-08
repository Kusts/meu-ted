/**
 * add-top-level-aliases — Add top-level field aliases by extracting the
 * VALUE EXPRESSION from the original `details: { X: expr }` field.
 *
 * For each `details: { snake_case_field: valueExpression }` field, add a
 * top-level alias: `camelCaseField: valueExpression`.
 *
 * This preserves correctness: the value expression is moved as-is, no
 * dangling `details` reference.
 */

import { readFileSync, writeFileSync, readdirSync } from "fs";
import { join } from "path";

const TOOLS_DIR = "./tools";

const SNAKE_TO_CAMEL: Record<string, string> = {
  transaction_id: "transactionId",
  account_id: "accountId",
  category_id: "categoryId",
  plan_id: "planId",
  goal_id: "goalId",
  budget_id: "budgetId",
  template_id: "templateId",
  payable_id: "payableId",
  account_payable_id: "accountPayableId",
  statement_id: "statementId",
  cycle_year_month: "cycleYearMonth",
  total_cents: "totalCents",
  paid_cents: "paidCents",
  balance_cents: "balanceCents",
  income_cents: "incomeCents",
  expense_cents: "expenseCents",
  year_month: "yearMonth",
  setting_id: "settingId",
  notification_type: "notificationType",
  schedule_hour: "scheduleHour",
  schedule_minute: "scheduleMinute",
  days_of_week: "daysOfWeek",
  threshold_days: "thresholdDays",
  threshold_percent: "thresholdPercent",
  grouping_enabled: "groupingEnabled",
  grouping_max_items: "groupingMaxItems",
  grouping_window_minutes: "groupingWindowMinutes",
  last_sent_at: "lastSentAt",
  chat_id: "chatId",
  target_amount_cents: "targetAmountCents",
  current_amount_cents: "currentAmountCents",
  start_date: "startDate",
  target_date: "targetDate",
  end_date: "endDate",
  alert_threshold: "alertThreshold",
  recurring_purchase_id: "recurringPurchaseId",
  installment_plan_id: "installmentPlanId",
  installment_number: "installmentNumber",
  installments_total: "installmentsTotal",
  is_credit_card_purchase: "isCreditCardPurchase",
  from_account_id: "fromAccountId",
  to_account_id: "toAccountId",
  source_message_id: "sourceMessageId",
  initial_balance_cents: "initialBalanceCents",
  name_normalized: "nameNormalized",
  closing_day: "closingDay",
  due_day: "dueDay",
  credit_limit_cents: "creditLimitCents",
  transactions: "transactions",
  accounts: "accounts",
  categories: "categories",
  statements: "statements",
  logs: "logs",
  payables: "payables",
  templates: "templates",
  installments: "installments",
  contributions: "contributions",
  payments: "payments",
  reminders: "reminders",
  notifications: "notifications",
  purchases: "purchases",
};

interface Block {
  start: number;
  end: number;
  text: string;
}

function findReturnBlocks(content: string): Block[] {
  const blocks: Block[] = [];
  const re = /return\s*\{/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    const start = m.index;
    let depth = 0;
    let i = m.index + m[0].length - 1;
    let inString = false;
    let stringChar = "";
    while (i < content.length) {
      const c = content[i];
      const prev = i > 0 ? content[i - 1] : "";
      if (!inString) {
        if (c === "{") depth++;
        else if (c === "}") { depth--; if (depth === 0) { blocks.push({ start, end: i + 1, text: content.slice(start, i + 1) }); break; } }
        else if (c === '"' || c === "'" || c === "`") { inString = true; stringChar = c; }
      } else { if (c === stringChar && prev !== "\\") inString = false; }
      i++;
    }
  }
  return blocks;
}

/**
 * Extract a field's value expression from `details: { key: value }`.
 * Returns an array of { key, valueExpression } pairs (with raw text positions).
 */
function extractDetailsFields(text: string): Array<{ key: string; value: string }> {
  const re = /details\s*:\s*\{/;
  const m = re.exec(text);
  if (!m) return [];
  const start = m.index + m[0].length;
  let depth = 1;
  let i = start;
  let inString = false;
  let stringChar = "";
  while (i < text.length && depth > 0) {
    const c = text[i];
    const prev = i > 0 ? text[i - 1] : "";
    if (!inString) {
      if (c === "{") depth++;
      else if (c === "}") depth--;
      else if (c === '"' || c === "'" || c === "`") { inString = true; stringChar = c; }
      i++;
    } else { if (c === stringChar && prev !== "\\") inString = false; i++; }
  }
  const detailsBody = text.slice(start, i - 1);

  // Find top-level `key: value` pairs (or JS shorthand `key,` / `key\n`).
  const fields: Array<{ key: string; value: string }> = [];
  // Match either `key: value,` or shorthand `key,` / `key\n` (followed by , or })
  const keyRe = /(?:^|[,{])\s*(\w+)\s*(?::|([,}\s]))/g;
  let km;
  while ((km = keyRe.exec(detailsBody)) !== null) {
    const key = km[1];
    if (key === "duplicate_detected" || key === "hint" || key === "match_type" || key === "existing_account_id" || key === "existing_category_id" || key === "existing_transaction_id" || key === "duplicate") continue;
    // Find the value: skip past `: ` and find the comma at depth 0
    const valueStart = km.index + km[0].length;
    let d = 0;
    let j = valueStart;
    let inStr = false;
    let sc = "";
    while (j < detailsBody.length) {
      const c = detailsBody[j];
      const prev = j > 0 ? detailsBody[j - 1] : "";
      if (!inStr) {
        if (c === "{" || c === "[" || c === "(") d++;
        else if (c === "}" || c === "]" || c === ")") d--;
        else if (c === "," && d === 0) break;
        else if (c === '"' || c === "'" || c === "`") { inStr = true; sc = c; }
      } else {
        if (c === sc && prev !== "\\") inStr = false;
      }
      j++;
    }
    const value = detailsBody.slice(valueStart, j).trim();
    fields.push({ key, value });
  }
  return fields;
}

/**
 * Find existing top-level keys in a return block.
 * Only looks at keys BEFORE the first `details:` field (which is a sub-object).
 */
function getExistingTopLevelKeys(text: string): Set<string> {
  const keys = new Set<string>();
  // Cut at the first 'details:' field
  const detailsMatch = text.match(/details\s*:\s*\{/);
  const searchSpace = detailsMatch ? text.slice(0, detailsMatch.index) : text;
  const re = /^\s*(\w+)\s*:/gm;
  let m;
  while ((m = re.exec(searchSpace)) !== null) {
    keys.add(m[1]);
  }
  return keys;
}

function addAliases(text: string, fields: Array<{ key: string; value: string }>): string {
  const existing = getExistingTopLevelKeys(text);
  const lines: string[] = [];
  for (const { key, value } of fields) {
    const camel = SNAKE_TO_CAMEL[key] || key;
    if (existing.has(key) || existing.has(camel)) continue;
    // Use a value that's not a complex object/array — if it is, skip
    if (value.startsWith("{") || value.startsWith("[")) continue;
    lines.push(`        ${camel}: ${value},`);
  }
  if (lines.length === 0) return text;
  return text.replace(/(success\s*:\s*(true|false)\s*,?\s*\n)/, `$1${lines.join("\n")}\n`);
}

function migrateFile(filepath: string): { changed: boolean; blocksModified: number } {
  const content = readFileSync(filepath, "utf-8");
  const blocks = findReturnBlocks(content);
  let modified = content;
  let count = 0;
  for (let i = blocks.length - 1; i >= 0; i--) {
    const b = blocks[i];
    if (!/details\s*:\s*\{/.test(b.text)) continue;
    const fields = extractDetailsFields(b.text);
    if (fields.length === 0) continue;
    const newText = addAliases(b.text, fields);
    if (newText !== b.text) {
      modified = modified.slice(0, b.start) + newText + modified.slice(b.end);
      count++;
    }
  }
  if (count > 0) writeFileSync(filepath, modified, "utf-8");
  return { changed: count > 0, blocksModified: count };
}

const targetFiles = readdirSync(TOOLS_DIR)
  .filter((f) => f.endsWith(".ts") && !f.includes("-helpers") && !f.includes("duplicate-detector"))
  .map((f) => join(TOOLS_DIR, f));

let totalChanged = 0;
let totalBlocks = 0;
for (const f of targetFiles) {
  const r = migrateFile(f);
  if (r.changed) { console.log(`✅ ${f}: ${r.blocksModified} blocks`); totalChanged++; totalBlocks += r.blocksModified; }
}
console.log(`\n🎉 ${totalChanged} files, ${totalBlocks} blocks`);
