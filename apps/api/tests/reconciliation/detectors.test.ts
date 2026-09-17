import { describe, expect, it } from "vitest";
import {
  buildReport,
  detectAccountsBalanceDrift,
  detectCardPurchaseDrift,
  detectDuplicates,
  detectGoalContributionDrift,
  detectPayablePaymentDrift,
  detectStatementPaymentDrift,
  detectStatementTotalDrift,
} from "../../src/scripts/reconciliation/detectors.js";

describe("detectAccountsBalanceDrift", () => {
  it("reports zero findings for a healthy anchored account", () => {
    const result = detectAccountsBalanceDrift([
      {
        accountId: "a1",
        householdId: "h1",
        storedCents: 9500,
        initialCents: 10000,
        incomeCents: 500,
        expenseCents: 1000,
        transferInCents: 0,
        transferOutCents: 0,
      },
    ]);
    expect(result.check).toBe("accounts_balance");
    expect(result.findings).toHaveLength(0);
    expect(result.counts).toEqual({ checked: 1, drifted: 0 });
  });

  it("flags stored balance diverging from the ledger derivation", () => {
    const result = detectAccountsBalanceDrift([
      {
        accountId: "a1",
        householdId: "h1",
        storedCents: 8000,
        initialCents: 10000,
        incomeCents: 500,
        expenseCents: 1000,
        transferInCents: 0,
        transferOutCents: 0,
      },
    ]);
    expect(result.counts.drifted).toBe(1);
    expect(result.findings[0]?.kind).toBe("balance_drift");
    expect(result.findings[0]?.expected).toBe(9500);
    expect(result.findings[0]?.actual).toBe(8000);
  });

  it("marks unanchored rows as info instead of drift", () => {
    const result = detectAccountsBalanceDrift([
      {
        accountId: "a1",
        householdId: "h1",
        storedCents: 9500,
        initialCents: null,
        incomeCents: 500,
        expenseCents: 1000,
        transferInCents: 0,
        transferOutCents: 0,
      },
    ]);
    expect(result.counts).toEqual({ checked: 1, drifted: 0 });
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.severity).toBe("info");
  });

  it("flags a negative stored balance even without an anchor", () => {
    const result = detectAccountsBalanceDrift([
      {
        accountId: "a1",
        householdId: "h1",
        storedCents: -5,
        initialCents: null,
        incomeCents: 0,
        expenseCents: 5,
        transferInCents: 0,
        transferOutCents: 0,
      },
    ]);
    expect(result.counts.drifted).toBe(1);
    expect(result.findings[0]?.kind).toBe("negative_stored_balance");
  });
});

describe("detectStatementTotalDrift", () => {
  it("reports zero findings when stored totals match linked sums", () => {
    const result = detectStatementTotalDrift([
      {
        statementId: "s1",
        householdId: "h1",
        storedTotalCents: 3000,
        linkedSumCents: 3000,
        linkedCount: 2,
      },
    ]);
    expect(result.findings).toHaveLength(0);
    expect(result.counts).toEqual({ checked: 1, drifted: 0 });
  });

  it("flags stored total diverging from the linked transaction sum", () => {
    const result = detectStatementTotalDrift([
      {
        statementId: "s1",
        householdId: "h1",
        storedTotalCents: 3000,
        linkedSumCents: 2500,
        linkedCount: 2,
      },
    ]);
    expect(result.counts.drifted).toBe(1);
    expect(result.findings[0]?.kind).toBe("total_drift");
    expect(result.findings[0]?.entityId).toBe("s1");
  });
});

describe("detectStatementPaymentDrift", () => {
  it("reports zero findings for coherent paid and open statements", () => {
    const result = detectStatementPaymentDrift([
      {
        statementId: "s1",
        householdId: "h1",
        cycle: "2026-08",
        totalCents: 3000,
        paidCents: 3000,
        status: "paid",
      },
      {
        statementId: "s2",
        householdId: "h1",
        cycle: "2026-09",
        totalCents: 1000,
        paidCents: 0,
        status: "open",
      },
    ]);
    expect(result.findings).toHaveLength(0);
    expect(result.counts).toEqual({ checked: 2, drifted: 0 });
  });

  it("flags overpayment and status incoherence", () => {
    const result = detectStatementPaymentDrift([
      {
        statementId: "s1",
        householdId: "h1",
        cycle: "2026-08",
        totalCents: 3000,
        paidCents: 4000,
        status: "paid",
      },
      {
        statementId: "s2",
        householdId: "h1",
        cycle: "2026-09",
        totalCents: 1000,
        paidCents: 0,
        status: "paid",
      },
    ]);
    const kinds = result.findings.map((f) => f.kind).sort();
    expect(kinds).toEqual(["overpaid", "status_mismatch"]);
    expect(result.counts.drifted).toBe(2);
  });

  it("flags cycle payment coverage gaps from legacy payment transactions", () => {
    const result = detectStatementPaymentDrift(
      [
        {
          statementId: "s1",
          householdId: "h1",
          cycle: "2026-08",
          totalCents: 3000,
          paidCents: 3000,
          status: "paid",
        },
      ],
      [
        {
          householdId: "h1",
          cycle: "2026-08",
          statementsPaidSum: 3000,
          paymentTxSumCents: 2500,
          statementCount: 1,
        },
      ],
    );
    expect(result.findings.some((f) => f.kind === "payment_coverage_gap")).toBe(
      true,
    );
  });
});

describe("detectPayablePaymentDrift", () => {
  it("reports zero findings for a coherent paid and pending payable", () => {
    const result = detectPayablePaymentDrift([
      {
        payableId: "p1",
        householdId: "h1",
        status: "paid",
        amountCents: 1000,
        paidAmountCents: 1000,
        paidTransactionId: "t1",
        paidTxExists: true,
        paidTxDeleted: false,
        paymentTxCount: 1,
      },
      {
        payableId: "p2",
        householdId: "h1",
        status: "pending",
        amountCents: 500,
        paidAmountCents: null,
        paidTransactionId: null,
        paidTxExists: false,
        paidTxDeleted: false,
        paymentTxCount: 0,
      },
    ]);
    expect(result.findings).toHaveLength(0);
    expect(result.counts).toEqual({ checked: 2, drifted: 0 });
  });

  it("flags paid-without-transaction and multiple payments for the same payable", () => {
    const result = detectPayablePaymentDrift([
      {
        payableId: "p1",
        householdId: "h1",
        status: "paid",
        amountCents: 1000,
        paidAmountCents: 1000,
        paidTransactionId: null,
        paidTxExists: false,
        paidTxDeleted: false,
        paymentTxCount: 0,
      },
      {
        payableId: "p2",
        householdId: "h1",
        status: "paid",
        amountCents: 1000,
        paidAmountCents: 1000,
        paidTransactionId: "t2",
        paidTxExists: true,
        paidTxDeleted: false,
        paymentTxCount: 3,
      },
    ]);
    const kinds = result.findings.map((f) => f.kind).sort();
    expect(kinds).toEqual(["missing_payment_transaction", "multiple_payments"]);
  });

  it("flags paid amount diverging from the payable amount", () => {
    const result = detectPayablePaymentDrift([
      {
        payableId: "p1",
        householdId: "h1",
        status: "paid",
        amountCents: 1000,
        paidAmountCents: 800,
        paidTransactionId: "t1",
        paidTxExists: true,
        paidTxDeleted: false,
        paymentTxCount: 1,
      },
    ]);
    expect(result.findings[0]?.kind).toBe("paid_amount_mismatch");
  });
});

describe("detectGoalContributionDrift", () => {
  it("reports zero findings when current amount matches contributions", () => {
    const result = detectGoalContributionDrift([
      {
        goalId: "g1",
        householdId: "h1",
        storedCurrentCents: 1500,
        contributionsSumCents: 1500,
        contributionCount: 3,
      },
    ]);
    expect(result.findings).toHaveLength(0);
    expect(result.counts).toEqual({ checked: 1, drifted: 0 });
  });

  it("flags current amount diverging from the contribution sum", () => {
    const result = detectGoalContributionDrift([
      {
        goalId: "g1",
        householdId: "h1",
        storedCurrentCents: 2000,
        contributionsSumCents: 1500,
        contributionCount: 3,
      },
    ]);
    expect(result.counts.drifted).toBe(1);
    expect(result.findings[0]?.kind).toBe("contribution_drift");
  });
});

describe("detectCardPurchaseDrift", () => {
  it("reports zero findings for linked pairs that agree", () => {
    const result = detectCardPurchaseDrift([
      {
        cardPurchaseId: "cp1",
        householdId: "h1",
        statementId: "s1",
        purchaseAmountCents: 1000,
        purchaseDescription: "Store",
        purchaseDate: "2026-08-10",
        txId: "t1",
        txAmountCents: 1000,
        txDescription: "Store",
        txDate: "2026-08-10",
        txDeleted: false,
      },
    ]);
    expect(result.findings).toHaveLength(0);
    expect(result.counts).toEqual({ checked: 1, drifted: 0 });
  });

  it("flags amount, description and date divergences on linked pairs", () => {
    const result = detectCardPurchaseDrift([
      {
        cardPurchaseId: "cp1",
        householdId: "h1",
        statementId: "s1",
        purchaseAmountCents: 1000,
        purchaseDescription: "Store",
        purchaseDate: "2026-08-10",
        txId: "t1",
        txAmountCents: 1200,
        txDescription: "Other",
        txDate: "2026-08-11",
        txDeleted: false,
      },
    ]);
    const kinds = result.findings.map((f) => f.kind).sort();
    expect(kinds).toEqual([
      "purchase_amount_mismatch",
      "purchase_date_mismatch",
      "purchase_description_mismatch",
    ]);
  });

  it("skips unlinked purchases because orphans belong to the duplicates check", () => {
    const result = detectCardPurchaseDrift([
      {
        cardPurchaseId: "cp1",
        householdId: "h1",
        statementId: "s1",
        purchaseAmountCents: 1000,
        purchaseDescription: "Store",
        purchaseDate: "2026-08-10",
        txId: null,
        txAmountCents: null,
        txDescription: null,
        txDate: null,
        txDeleted: false,
      },
    ]);
    expect(result.findings).toHaveLength(0);
    expect(result.counts).toEqual({ checked: 1, drifted: 0 });
  });
});

describe("detectDuplicates", () => {
  it("reports zero findings for a healthy state", () => {
    const result = detectDuplicates({
      payablePayments: [
        { payableId: "p1", householdId: "h1", livePaymentTxCount: 1 },
      ],
      idempotencyConflicts: [
        { scope: "h1", key: "k1", payloadHashes: ["abc"] },
      ],
      orphanTransactions: [],
      orphanCardPurchases: [],
      recurringSuccessors: [],
    });
    expect(result.check).toBe("duplicates");
    expect(result.findings).toHaveLength(0);
    expect(result.counts.drifted).toBe(0);
  });

  it("flags every duplicate and orphan class", () => {
    const result = detectDuplicates({
      payablePayments: [
        { payableId: "p1", householdId: "h1", livePaymentTxCount: 2 },
      ],
      idempotencyConflicts: [
        { scope: "h1", key: "k1", payloadHashes: ["abc", "def"] },
      ],
      orphanTransactions: [
        {
          transactionId: "t9",
          householdId: "h1",
          accountRef: "missing",
          reason: "missing_account",
        },
      ],
      orphanCardPurchases: [
        { cardPurchaseId: "cp9", householdId: "h1", transactionId: null },
      ],
      recurringSuccessors: [
        {
          kind: "payable",
          householdId: "h1",
          key: "Rent|2026-09-01",
          count: 2,
          ids: ["p1", "p2"],
        },
      ],
    });
    const kinds = result.findings.map((f) => f.kind).sort();
    expect(kinds).toEqual([
      "divergent_idempotency_payload",
      "duplicated_recurring_successor",
      "multiple_payable_payments",
      "orphan_card_purchase",
      "orphan_transaction",
    ]);
    expect(result.counts).toEqual({ checked: 5, drifted: 5 });
  });
});

describe("buildReport", () => {
  it("shapes the canonical JSON report with totals", () => {
    const checks = [
      detectStatementTotalDrift([
        {
          statementId: "s1",
          householdId: "h1",
          storedTotalCents: 3000,
          linkedSumCents: 2500,
          linkedCount: 1,
        },
      ]),
      detectGoalContributionDrift([
        {
          goalId: "g1",
          householdId: "h1",
          storedCurrentCents: 1500,
          contributionsSumCents: 1500,
          contributionCount: 1,
        },
      ]),
    ];
    const report = buildReport(checks, {
      schema: "canonical",
      generatedAt: "2026-09-17T00:00:00.000Z",
    });
    expect(report.schema).toBe("canonical");
    expect(report.checks).toHaveLength(2);
    expect(report.totals).toEqual({ checked: 2, drifted: 1, info: 0 });
    expect(JSON.parse(JSON.stringify(report))).toEqual(report);
  });
});
