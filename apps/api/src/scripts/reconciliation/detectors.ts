export type Severity = "drift" | "info";

export type CheckName =
  | "accounts_balance"
  | "statement_total"
  | "statement_payment"
  | "payable_payment"
  | "goal_contribution"
  | "card_purchase"
  | "duplicates";

export type Finding = {
  check: CheckName;
  entity: string;
  entityId: string;
  kind: string;
  severity: Severity;
  expected?: number | string;
  actual?: number | string;
  detail?: Record<string, number | string | boolean | null>;
};

export type CheckResult = {
  check: CheckName;
  findings: Finding[];
  counts: { checked: number; drifted: number };
  workspaceScope?: string;
};

export type AccountBalanceRow = {
  accountId: string;
  householdId: string;
  storedCents: number;
  initialCents: number | null;
  incomeCents: number;
  expenseCents: number;
  transferInCents: number;
  transferOutCents: number;
};

export type StatementTotalRow = {
  statementId: string;
  householdId: string;
  storedTotalCents: number;
  linkedSumCents: number;
  linkedCount: number;
};

export type StatementPaymentRow = {
  statementId: string;
  householdId: string;
  cycle: string;
  totalCents: number;
  paidCents: number;
  status: string;
};

export type CyclePaymentRow = {
  householdId: string;
  cycle: string;
  statementsPaidSum: number;
  paymentTxSumCents: number;
  statementCount: number;
};

export type PayablePaymentRow = {
  payableId: string;
  householdId: string;
  status: string;
  amountCents: number;
  paidAmountCents: number | null;
  paidTransactionId: string | null;
  paidTxExists: boolean;
  paidTxDeleted: boolean;
  paymentTxCount: number;
};

export type GoalContributionRow = {
  goalId: string;
  householdId: string;
  storedCurrentCents: number;
  contributionsSumCents: number;
  contributionCount: number;
};

export type CardPurchaseRow = {
  cardPurchaseId: string;
  householdId: string;
  statementId: string;
  purchaseAmountCents: number;
  purchaseDescription: string;
  purchaseDate: string;
  txId: string | null;
  txAmountCents: number | null;
  txDescription: string | null;
  txDate: string | null;
  txDeleted: boolean;
};

export type DuplicatesInput = {
  payablePayments: Array<{
    payableId: string;
    householdId: string;
    livePaymentTxCount: number;
  }>;
  idempotencyConflicts: Array<{
    scope: string;
    key: string;
    payloadHashes: string[];
  }>;
  orphanTransactions: Array<{
    transactionId: string;
    householdId: string;
    accountRef: string;
    reason: string;
  }>;
  orphanCardPurchases: Array<{
    cardPurchaseId: string;
    householdId: string;
    transactionId: string | null;
  }>;
  recurringSuccessors: Array<{
    kind: "payable" | "recurring_purchase";
    householdId: string;
    key: string;
    count: number;
    ids: string[];
  }>;
};

export type ReconReport = {
  generatedAt: string;
  schema: string;
  checks: CheckResult[];
  totals: { checked: number; drifted: number; info: number };
  householdScope?: string;
};

const emptyResult = (
  check: CheckName,
  workspaceScope?: string,
): CheckResult => {
  const result: CheckResult = {
    check,
    findings: [],
    counts: { checked: 0, drifted: 0 },
  };
  if (workspaceScope !== undefined) result.workspaceScope = workspaceScope;
  return result;
};

const pushDrift = (
  result: CheckResult,
  finding: Omit<Finding, "check" | "severity"> & { severity?: Severity },
): void => {
  result.findings.push({
    ...finding,
    check: result.check,
    severity: finding.severity ?? "drift",
  });
  if (finding.severity !== "info") result.counts.drifted += 1;
};

export const detectAccountsBalanceDrift = (
  rows: AccountBalanceRow[],
  workspaceScope?: string,
): CheckResult => {
  const result = emptyResult("accounts_balance", workspaceScope);
  for (const row of rows) {
    result.counts.checked += 1;
    if (row.initialCents === null) {
      if (row.storedCents < 0) {
        pushDrift(result, {
          entity: "accounts",
          entityId: row.accountId,
          kind: "negative_stored_balance",
          actual: row.storedCents,
        });
      } else {
        pushDrift(result, {
          entity: "accounts",
          entityId: row.accountId,
          kind: "unanchored_basis",
          severity: "info",
          actual: row.storedCents,
        });
      }
      continue;
    }
    const derived =
      row.initialCents +
      row.incomeCents -
      row.expenseCents -
      row.transferOutCents +
      row.transferInCents;
    if (row.storedCents !== derived) {
      pushDrift(result, {
        entity: "accounts",
        entityId: row.accountId,
        kind: "balance_drift",
        expected: derived,
        actual: row.storedCents,
        detail: {
          initial_cents: row.initialCents,
          income_cents: row.incomeCents,
          expense_cents: row.expenseCents,
          transfer_in_cents: row.transferInCents,
          transfer_out_cents: row.transferOutCents,
        },
      });
    } else if (row.storedCents < 0) {
      pushDrift(result, {
        entity: "accounts",
        entityId: row.accountId,
        kind: "negative_stored_balance",
        actual: row.storedCents,
      });
    }
  }
  return result;
};

export const detectStatementTotalDrift = (
  rows: StatementTotalRow[],
  workspaceScope?: string,
): CheckResult => {
  const result = emptyResult("statement_total", workspaceScope);
  for (const row of rows) {
    result.counts.checked += 1;
    if (row.storedTotalCents !== row.linkedSumCents) {
      pushDrift(result, {
        entity: "statements",
        entityId: row.statementId,
        kind: "total_drift",
        expected: row.linkedSumCents,
        actual: row.storedTotalCents,
        detail: { linked_count: row.linkedCount },
      });
    }
  }
  return result;
};

export const detectStatementPaymentDrift = (
  statements: StatementPaymentRow[],
  cyclePayments: CyclePaymentRow[] = [],
  workspaceScope?: string,
): CheckResult => {
  const result = emptyResult("statement_payment", workspaceScope);
  for (const row of statements) {
    result.counts.checked += 1;
    if (row.paidCents < 0) {
      pushDrift(result, {
        entity: "statements",
        entityId: row.statementId,
        kind: "negative_paid",
        actual: row.paidCents,
      });
      continue;
    }
    if (row.paidCents > row.totalCents) {
      pushDrift(result, {
        entity: "statements",
        entityId: row.statementId,
        kind: "overpaid",
        expected: row.totalCents,
        actual: row.paidCents,
      });
      continue;
    }
    if (row.status === "paid" && row.paidCents < row.totalCents) {
      pushDrift(result, {
        entity: "statements",
        entityId: row.statementId,
        kind: "status_mismatch",
        expected: row.totalCents,
        actual: row.paidCents,
        detail: { status: row.status },
      });
    } else if (
      row.totalCents > 0 &&
      row.paidCents >= row.totalCents &&
      row.status !== "paid"
    ) {
      pushDrift(result, {
        entity: "statements",
        entityId: row.statementId,
        kind: "status_mismatch",
        expected: row.totalCents,
        actual: row.paidCents,
        detail: { status: row.status },
      });
    } else if (
      row.paidCents === 0 &&
      (row.status === "paid" || row.status === "partial")
    ) {
      pushDrift(result, {
        entity: "statements",
        entityId: row.statementId,
        kind: "status_mismatch",
        expected: 0,
        actual: row.paidCents,
        detail: { status: row.status },
      });
    }
  }
  for (const cycle of cyclePayments) {
    result.counts.checked += 1;
    if (cycle.paymentTxSumCents !== cycle.statementsPaidSum) {
      pushDrift(result, {
        entity: "statement_cycle",
        entityId: `${cycle.householdId}|${cycle.cycle}`,
        kind: "payment_coverage_gap",
        expected: cycle.statementsPaidSum,
        actual: cycle.paymentTxSumCents,
        detail: { statement_count: cycle.statementCount },
      });
    }
  }
  return result;
};

export const detectPayablePaymentDrift = (
  rows: PayablePaymentRow[],
  workspaceScope?: string,
): CheckResult => {
  const result = emptyResult("payable_payment", workspaceScope);
  for (const row of rows) {
    result.counts.checked += 1;
    if (row.status === "paid") {
      if (
        row.paidTransactionId === null ||
        !row.paidTxExists ||
        row.paidTxDeleted
      ) {
        pushDrift(result, {
          entity: "accounts_payable",
          entityId: row.payableId,
          kind: "missing_payment_transaction",
          detail: {
            linked: row.paidTransactionId ?? "none",
            deleted: row.paidTxDeleted,
          },
        });
      }
      if (
        row.paidAmountCents !== null &&
        row.paidAmountCents !== row.amountCents
      ) {
        pushDrift(result, {
          entity: "accounts_payable",
          entityId: row.payableId,
          kind: "paid_amount_mismatch",
          expected: row.amountCents,
          actual: row.paidAmountCents,
        });
      }
      if (row.paymentTxCount > 1) {
        pushDrift(result, {
          entity: "accounts_payable",
          entityId: row.payableId,
          kind: "multiple_payments",
          expected: 1,
          actual: row.paymentTxCount,
        });
      }
    } else if (
      row.status !== "cancelled" &&
      row.paymentTxCount > 0 &&
      row.paidTxExists &&
      !row.paidTxDeleted
    ) {
      pushDrift(result, {
        entity: "accounts_payable",
        entityId: row.payableId,
        kind: "unexpected_payment_transaction",
        detail: { status: row.status },
      });
    }
  }
  return result;
};

export const detectGoalContributionDrift = (
  rows: GoalContributionRow[],
  workspaceScope?: string,
): CheckResult => {
  const result = emptyResult("goal_contribution", workspaceScope);
  for (const row of rows) {
    result.counts.checked += 1;
    if (row.storedCurrentCents !== row.contributionsSumCents) {
      pushDrift(result, {
        entity: "goals",
        entityId: row.goalId,
        kind: "contribution_drift",
        expected: row.contributionsSumCents,
        actual: row.storedCurrentCents,
        detail: { contribution_count: row.contributionCount },
      });
    }
  }
  return result;
};

export const detectCardPurchaseDrift = (
  rows: CardPurchaseRow[],
  workspaceScope?: string,
): CheckResult => {
  const result = emptyResult("card_purchase", workspaceScope);
  for (const row of rows) {
    result.counts.checked += 1;
    if (row.txId === null || row.txAmountCents === null || row.txDeleted)
      continue;
    if (row.purchaseAmountCents !== row.txAmountCents) {
      pushDrift(result, {
        entity: "card_purchases",
        entityId: row.cardPurchaseId,
        kind: "purchase_amount_mismatch",
        expected: row.txAmountCents,
        actual: row.purchaseAmountCents,
      });
    }
    if (
      row.txDescription !== null &&
      row.purchaseDescription !== row.txDescription
    ) {
      pushDrift(result, {
        entity: "card_purchases",
        entityId: row.cardPurchaseId,
        kind: "purchase_description_mismatch",
        expected: row.txDescription,
        actual: row.purchaseDescription,
      });
    }
    if (row.txDate !== null && row.purchaseDate !== row.txDate) {
      pushDrift(result, {
        entity: "card_purchases",
        entityId: row.cardPurchaseId,
        kind: "purchase_date_mismatch",
        expected: row.txDate,
        actual: row.purchaseDate,
      });
    }
  }
  return result;
};

export const detectDuplicates = (
  input: DuplicatesInput,
  workspaceScope?: string,
): CheckResult => {
  const result = emptyResult("duplicates", workspaceScope);
  for (const row of input.payablePayments) {
    result.counts.checked += 1;
    if (row.livePaymentTxCount > 1) {
      pushDrift(result, {
        entity: "accounts_payable",
        entityId: row.payableId,
        kind: "multiple_payable_payments",
        expected: 1,
        actual: row.livePaymentTxCount,
      });
    }
  }
  for (const row of input.idempotencyConflicts) {
    result.counts.checked += 1;
    if (new Set(row.payloadHashes).size > 1) {
      pushDrift(result, {
        entity: "idempotency_keys",
        entityId: `${row.scope}|${row.key}`,
        kind: "divergent_idempotency_payload",
        detail: { distinct_hashes: new Set(row.payloadHashes).size },
      });
    }
  }
  for (const row of input.orphanTransactions) {
    result.counts.checked += 1;
    pushDrift(result, {
      entity: "transactions",
      entityId: row.transactionId,
      kind: "orphan_transaction",
      detail: { account_ref: row.accountRef, reason: row.reason },
    });
  }
  for (const row of input.orphanCardPurchases) {
    result.counts.checked += 1;
    pushDrift(result, {
      entity: "card_purchases",
      entityId: row.cardPurchaseId,
      kind: "orphan_card_purchase",
      detail: { transaction_id: row.transactionId ?? "null" },
    });
  }
  for (const row of input.recurringSuccessors) {
    result.counts.checked += 1;
    if (row.count > 1) {
      pushDrift(result, {
        entity:
          row.kind === "payable" ? "accounts_payable" : "recurring_purchases",
        entityId: row.ids.join(","),
        kind: "duplicated_recurring_successor",
        expected: 1,
        actual: row.count,
        detail: { group: row.key },
      });
    }
  }
  return result;
};

export const buildReport = (
  checks: CheckResult[],
  meta: { schema: string; generatedAt: string; householdScope?: string },
): ReconReport => {
  const totals = { checked: 0, drifted: 0, info: 0 };
  for (const check of checks) {
    totals.checked += check.counts.checked;
    totals.drifted += check.counts.drifted;
    totals.info += check.findings.filter((f) => f.severity === "info").length;
  }
  const report: ReconReport = {
    generatedAt: meta.generatedAt,
    schema: meta.schema,
    checks,
    totals,
  };
  if (meta.householdScope !== undefined)
    report.householdScope = meta.householdScope;
  return report;
};
