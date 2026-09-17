import pg from "pg";
import {
  buildReport,
  detectAccountsBalanceDrift,
  detectCardPurchaseDrift,
  detectDuplicates,
  detectGoalContributionDrift,
  detectPayablePaymentDrift,
  detectStatementPaymentDrift,
  detectStatementTotalDrift,
} from "./detectors.js";
import type {
  AccountBalanceRow,
  CardPurchaseRow,
  CheckResult,
  CyclePaymentRow,
  DuplicatesInput,
  GoalContributionRow,
  PayablePaymentRow,
  ReconReport,
  StatementPaymentRow,
  StatementTotalRow,
} from "./detectors.js";
import {
  buildReconciliationQueries,
  CHECKS_BY_LAYOUT,
  isSelectOnly,
} from "./sql.js";
import type { ReconCheck, ReconQuery, SchemaLayout } from "./sql.js";

export type ReconCliOptions = {
  schema: "auto" | SchemaLayout;
  householdId?: string;
  format: "json" | "text";
  failOnDrift: boolean;
};

type Row = Record<string, unknown>;

const num = (value: unknown, fallback = 0): number => {
  if (value === null || value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const str = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
};

const reqStr = (value: unknown, fallback = ""): string =>
  str(value) ?? fallback;

export const parseArgs = (argv: string[]): ReconCliOptions | { help: true } => {
  const opts: ReconCliOptions = {
    schema: "auto",
    format: "json",
    failOnDrift: false,
  };
  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") return { help: true };
    else if (arg === "--fail-on-drift") opts.failOnDrift = true;
    else if (arg.startsWith("--schema=")) {
      const value = arg.slice("--schema=".length);
      if (value !== "auto" && value !== "legacy" && value !== "canonical") {
        throw new Error(
          `invalid --schema: ${value} (expected auto, legacy or canonical)`,
        );
      }
      opts.schema = value;
    } else if (
      arg.startsWith("--household=") ||
      arg.startsWith("--workspace=")
    ) {
      const value = arg.slice(arg.indexOf("=") + 1).trim();
      if (!value) throw new Error("household scope cannot be empty");
      opts.householdId = value;
    } else if (arg.startsWith("--format=")) {
      const value = arg.slice("--format=".length);
      if (value !== "json" && value !== "text") {
        throw new Error(`invalid --format: ${value} (expected json or text)`);
      }
      opts.format = value;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  return opts;
};

export const printHelp = (): string =>
  [
    "reconciliation — read-only financial reconciliation report",
    "",
    "Usage: pnpm reconciliation [--schema=auto|legacy|canonical] [--household=<uuid>] [--format=json|text] [--fail-on-drift]",
    "",
    "Only SELECT statements are executed. The connection sets default_transaction_read_only.",
    "Exit 0 normally, 1 when --fail-on-drift is set and any drift finding exists, 2 on usage or runtime errors.",
  ].join("\n");

export const probeSchemaLayout = async (
  query: (text: string) => Promise<Row[]>,
): Promise<SchemaLayout> => {
  const rows = await query(
    `SELECT
      EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'accounts' AND column_name = 'balance_cents') AS has_balance,
      EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'transactions' AND column_name = 'account_id') AS has_account_id`,
  );
  const first = rows[0];
  return first?.["has_balance"] === true && first?.["has_account_id"] === true
    ? "canonical"
    : "legacy";
};

export const resolveSchemaLayout = (
  opts: ReconCliOptions,
): SchemaLayout | "auto" => opts.schema;

const mapRows = {
  accounts_balance: (rows: Row[]): AccountBalanceRow[] =>
    rows.map((r) => ({
      accountId: reqStr(r["account_id"]),
      householdId: reqStr(r["household_id"]),
      storedCents: num(r["stored_cents"]),
      initialCents:
        r["initial_cents"] === null || r["initial_cents"] === undefined
          ? null
          : num(r["initial_cents"]),
      incomeCents: num(r["income_cents"]),
      expenseCents: num(r["expense_cents"]),
      transferInCents: num(r["transfer_in_cents"]),
      transferOutCents: num(r["transfer_out_cents"]),
    })),
  statement_total: (rows: Row[]): StatementTotalRow[] =>
    rows.map((r) => ({
      statementId: reqStr(r["statement_id"]),
      householdId: reqStr(r["household_id"]),
      storedTotalCents: num(r["stored_total_cents"]),
      linkedSumCents: num(r["linked_sum_cents"]),
      linkedCount: num(r["linked_count"]),
    })),
  statement_payment: (rows: Row[]): StatementPaymentRow[] =>
    rows.map((r) => ({
      statementId: reqStr(r["statement_id"]),
      householdId: reqStr(r["household_id"]),
      cycle: reqStr(r["cycle"]),
      totalCents: num(r["total_cents"]),
      paidCents: num(r["paid_cents"]),
      status: reqStr(r["status"]),
    })),
  statement_payment_coverage: (rows: Row[]): CyclePaymentRow[] =>
    rows.map((r) => ({
      householdId: reqStr(r["household_id"]),
      cycle: reqStr(r["cycle"]),
      statementsPaidSum: num(r["statements_paid_sum"]),
      paymentTxSumCents: num(r["payment_tx_sum_cents"]),
      statementCount: num(r["statement_count"]),
    })),
  payable_payment: (rows: Row[]): PayablePaymentRow[] =>
    rows.map((r) => ({
      payableId: reqStr(r["payable_id"]),
      householdId: reqStr(r["household_id"]),
      status: reqStr(r["status"]),
      amountCents: num(r["amount_cents"]),
      paidAmountCents:
        r["paid_amount_cents"] === null || r["paid_amount_cents"] === undefined
          ? null
          : num(r["paid_amount_cents"]),
      paidTransactionId: str(r["paid_transaction_id"]),
      paidTxExists: r["paid_tx_exists"] === true,
      paidTxDeleted: r["paid_tx_deleted"] === true,
      paymentTxCount: num(r["payment_tx_count"]),
    })),
  goal_contribution: (rows: Row[]): GoalContributionRow[] =>
    rows.map((r) => ({
      goalId: reqStr(r["goal_id"]),
      householdId: reqStr(r["household_id"]),
      storedCurrentCents: num(r["stored_current_cents"]),
      contributionsSumCents: num(r["contributions_sum_cents"]),
      contributionCount: num(r["contribution_count"]),
    })),
  card_purchase: (rows: Row[]): CardPurchaseRow[] =>
    rows.map((r) => ({
      cardPurchaseId: reqStr(r["card_purchase_id"]),
      householdId: reqStr(r["household_id"]),
      statementId: reqStr(r["statement_id"]),
      purchaseAmountCents: num(r["purchase_amount_cents"]),
      purchaseDescription: reqStr(r["purchase_description"]),
      purchaseDate: reqStr(r["purchase_date"]),
      txId: str(r["tx_id"]),
      txAmountCents:
        r["tx_amount_cents"] === null || r["tx_amount_cents"] === undefined
          ? null
          : num(r["tx_amount_cents"]),
      txDescription: str(r["tx_description"]),
      txDate: str(r["tx_date"]),
      txDeleted: r["tx_deleted"] === true,
    })),
};

export type ReconPool = {
  query: (text: string, values?: unknown[]) => Promise<{ rows: Row[] }>;
};

const fetchCheckRows = async (
  pool: ReconPool,
  query: ReconQuery,
): Promise<Row[]> => {
  if (!isSelectOnly(query.text))
    throw new Error("refusing to run a non-SELECT reconciliation query");
  const result = await pool.query(query.text, query.values);
  return result.rows;
};

export const runReconciliation = async (
  pool: ReconPool,
  layout: SchemaLayout,
  householdId?: string,
): Promise<ReconReport> => {
  const scope = householdId === undefined ? {} : { householdId };
  const queries = buildReconciliationQueries(layout, scope);
  const order = CHECKS_BY_LAYOUT[layout];
  const fetched = new Map<ReconCheck, Row[]>();
  for (const check of order) {
    fetched.set(check, await fetchCheckRows(pool, queries[check]));
  }
  const rowsOf = (check: ReconCheck): Row[] => fetched.get(check) ?? [];
  const payableRows = mapRows.payable_payment(rowsOf("payable_payment"));
  const checks: CheckResult[] = [
    detectAccountsBalanceDrift(
      mapRows.accounts_balance(rowsOf("accounts_balance")),
      householdId,
    ),
    detectStatementTotalDrift(
      mapRows.statement_total(rowsOf("statement_total")),
      householdId,
    ),
    detectStatementPaymentDrift(
      mapRows.statement_payment(rowsOf("statement_payment")),
      layout === "legacy"
        ? mapRows.statement_payment_coverage(
            rowsOf("statement_payment_coverage"),
          )
        : [],
      householdId,
    ),
    detectPayablePaymentDrift(payableRows, householdId),
    detectGoalContributionDrift(
      mapRows.goal_contribution(rowsOf("goal_contribution")),
      householdId,
    ),
    detectCardPurchaseDrift(
      mapRows.card_purchase(rowsOf("card_purchase")),
      householdId,
    ),
    detectDuplicates(buildDuplicatesInput(rowsOf, payableRows), householdId),
  ];
  const report: ReconReport = buildReport(checks, {
    schema: layout,
    generatedAt: new Date().toISOString(),
    ...(householdId === undefined ? {} : { householdScope: householdId }),
  });
  return report;
};

const buildDuplicatesInput = (
  rowsOf: (check: ReconCheck) => Row[],
  payableRows: PayablePaymentRow[],
): DuplicatesInput => {
  const input: DuplicatesInput = {
    payablePayments: payableRows.map((r) => ({
      payableId: r.payableId,
      householdId: r.householdId,
      livePaymentTxCount: r.paymentTxCount,
    })),
    idempotencyConflicts: rowsOf("dup_idempotency").map((r) => ({
      scope: reqStr(r["scope"]),
      key: reqStr(r["key"]),
      payloadHashes: Array.isArray(r["payload_hashes"])
        ? (r["payload_hashes"] as unknown[]).map(String)
        : [],
    })),
    orphanTransactions: rowsOf("dup_orphan_transactions").map((r) => ({
      transactionId: reqStr(r["transaction_id"]),
      householdId: reqStr(r["household_id"]),
      accountRef: reqStr(r["account_ref"]),
      reason: reqStr(r["reason"]),
    })),
    orphanCardPurchases: rowsOf("dup_orphan_card_purchases").map((r) => ({
      cardPurchaseId: reqStr(r["card_purchase_id"]),
      householdId: reqStr(r["household_id"]),
      transactionId: str(r["transaction_id"]),
    })),
    recurringSuccessors: [
      ...rowsOf("dup_recurring_payables").map((r) => ({
        kind: "payable" as const,
        householdId: reqStr(r["household_id"]),
        key: `${reqStr(r["description"])}|${reqStr(r["due_date"])}`,
        count: num(r["n"]),
        ids: Array.isArray(r["ids"]) ? (r["ids"] as unknown[]).map(String) : [],
      })),
      ...rowsOf("dup_recurring_purchases").map((r) => ({
        kind: "recurring_purchase" as const,
        householdId: reqStr(r["household_id"]),
        key: `${reqStr(r["account_id"])}|${reqStr(r["description"])}|${reqStr(r["start_date"])}`,
        count: num(r["n"]),
        ids: Array.isArray(r["ids"]) ? (r["ids"] as unknown[]).map(String) : [],
      })),
    ],
  };
  return input;
};

export const formatTextReport = (report: ReconReport): string => {
  const lines = [
    `reconciliation schema=${report.schema} checked=${report.totals.checked} drifted=${report.totals.drifted} info=${report.totals.info}`,
  ];
  for (const check of report.checks) {
    lines.push(
      `- ${check.check}: checked=${check.counts.checked} drifted=${check.counts.drifted}`,
    );
    for (const finding of check.findings) {
      const expected =
        finding.expected === undefined
          ? ""
          : ` expected=${String(finding.expected)}`;
      const actual =
        finding.actual === undefined ? "" : ` actual=${String(finding.actual)}`;
      lines.push(
        `  [${finding.severity}] ${finding.kind} ${finding.entity}:${finding.entityId}${expected}${actual}`,
      );
    }
  }
  return `${lines.join("\n")}\n`;
};

export const createReconPool = (connectionString: string): pg.Pool =>
  new pg.Pool({
    connectionString,
    max: 2,
    options: "-c default_transaction_read_only=on",
  });

export const main = async (
  argv: string[],
  env: Record<string, string | undefined>,
): Promise<number> => {
  let opts: ReconCliOptions;
  try {
    const parsed = parseArgs(argv);
    if ("help" in parsed) {
      process.stdout.write(`${printHelp()}\n`);
      return 0;
    }
    opts = parsed;
  } catch (err) {
    process.stderr.write(`error: ${(err as Error).message}\n${printHelp()}\n`);
    return 2;
  }
  const connectionString =
    env["DATABASE_URL"]?.trim() || env["DATABASE_URL_TEST"]?.trim();
  if (!connectionString) {
    process.stderr.write(
      "error: DATABASE_URL (or DATABASE_URL_TEST) is not set; nothing to do.\n",
    );
    return 2;
  }
  if (opts.schema === "auto" && env["DB_SCHEMA"] === "legacy")
    opts = { ...opts, schema: "legacy" };
  const pool = createReconPool(connectionString);
  try {
    let layout: SchemaLayout | "auto" =
      opts.schema === "auto" ? "auto" : opts.schema;
    if (layout === "auto") {
      layout = await probeSchemaLayout(
        async (text) => (await pool.query(text)).rows as Row[],
      );
    }
    const report = await runReconciliation(pool, layout, opts.householdId);
    if (opts.format === "text") process.stdout.write(formatTextReport(report));
    else process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return opts.failOnDrift && report.totals.drifted > 0 ? 1 : 0;
  } catch (err) {
    process.stderr.write(`reconciliation failed: ${(err as Error).message}\n`);
    return 1;
  } finally {
    await pool.end();
  }
};

const invokedAsCli =
  process.argv[1] !== undefined &&
  /reconciliation[/\\]run\.(ts|js)$/.test(process.argv[1]);

if (invokedAsCli) {
  void main(
    process.argv.slice(2),
    process.env as Record<string, string | undefined>,
  ).then(
    (code) => {
      process.exitCode = code;
    },
    (err) => {
      process.stderr.write(
        `reconciliation failed: ${(err as Error).message}\n`,
      );
      process.exitCode = 1;
    },
  );
}
