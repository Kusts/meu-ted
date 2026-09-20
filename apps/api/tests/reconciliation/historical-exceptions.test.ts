import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  buildReport,
  detectDuplicates,
  detectStatementTotalDrift,
} from "../../src/scripts/reconciliation/detectors.js";
import type { CheckResult } from "../../src/scripts/reconciliation/detectors.js";
import {
  APPROVED_HISTORICAL_ALLOWLIST,
  EXPECTED_ORPHAN_CARD_PURCHASES,
  EXPECTED_STATEMENT_TOTALS,
  HISTORICAL_EXCEPTION_VERSION,
  applyHistoricalExceptions,
  fingerprintOrphanCardPurchase,
  fingerprintStatementTotal,
  hashHouseholdScope,
} from "../../src/scripts/reconciliation/historical-exceptions.js";
import type {
  HistoricalAllowlist,
  OrphanExceptionSource,
  StatementExceptionSource,
} from "../../src/scripts/reconciliation/historical-exceptions.js";

const sha256 = (preimage: string): string =>
  createHash("sha256").update(preimage, "utf8").digest("hex");

const orphanA: OrphanExceptionSource = {
  cardPurchaseId: "cp-a",
  householdId: "h1",
  statementId: "s1",
  accountId: "a1",
  amountCents: 1000,
  purchaseDate: "2026-08-10",
  description: "Coffee",
  transactionId: null,
};

const orphanB: OrphanExceptionSource = {
  cardPurchaseId: "cp-b",
  householdId: "h1",
  statementId: "s1",
  accountId: "a1",
  amountCents: 2500,
  purchaseDate: "2026-08-11",
  description: "Books",
  transactionId: "t-linked",
};

const statementA: StatementExceptionSource = {
  statementId: "s1",
  householdId: "h1",
  storedTotalCents: 3000,
  linkedSumCents: 0,
  linkedCount: 0,
  purchaseSumCents: 3500,
  purchaseCount: 2,
};

const makeAllowlist = (
  orphans: OrphanExceptionSource[],
  statements: StatementExceptionSource[],
): HistoricalAllowlist => ({
  version: "test-allowlist-v1",
  orphanCardPurchaseFingerprints: new Set(
    orphans.map(fingerprintOrphanCardPurchase),
  ),
  statementTotalFingerprints: new Set(
    statements.map(fingerprintStatementTotal),
  ),
  expectedOrphanCardPurchases: orphans.length,
  expectedStatementTotals: statements.length,
  approvedHouseholdScopeHash: hashHouseholdScope("h1"),
});

const buildChecks = (
  orphans: OrphanExceptionSource[],
  statements: StatementExceptionSource[],
): CheckResult[] => [
  detectStatementTotalDrift(
    statements.map((s) => ({
      statementId: s.statementId,
      householdId: s.householdId,
      storedTotalCents: s.storedTotalCents,
      linkedSumCents: s.linkedSumCents,
      linkedCount: s.linkedCount,
      purchaseSumCents: s.purchaseSumCents,
      purchaseCount: s.purchaseCount,
    })),
  ),
  detectDuplicates({
    payablePayments: [],
    idempotencyConflicts: [],
    orphanTransactions: [],
    orphanCardPurchases: orphans.map((o) => ({
      cardPurchaseId: o.cardPurchaseId,
      householdId: o.householdId,
      transactionId: o.transactionId,
    })),
    recurringSuccessors: [],
  }),
];

describe("historical exception fingerprints (ADR-017)", () => {
  it("pins the exact orphan fingerprint format", () => {
    expect(fingerprintOrphanCardPurchase(orphanA)).toBe(
      sha256("orphan_card_purchase:cp-a:h1:s1:a1:1000:2026-08-10:Coffee:"),
    );
    expect(fingerprintOrphanCardPurchase(orphanB)).toBe(
      sha256(
        "orphan_card_purchase:cp-b:h1:s1:a1:2500:2026-08-11:Books:t-linked",
      ),
    );
  });

  it("pins the exact statement fingerprint format", () => {
    expect(fingerprintStatementTotal(statementA)).toBe(
      sha256("statement_total:s1:h1:3000:0:0:3500:2"),
    );
  });

  it("ships the approved ADR-017 counts with hash-only entries", () => {
    expect(HISTORICAL_EXCEPTION_VERSION).toBe("adr-017-pre-v033-v1");
    expect(EXPECTED_ORPHAN_CARD_PURCHASES).toBe(47);
    expect(EXPECTED_STATEMENT_TOTALS).toBe(8);
    expect(
      APPROVED_HISTORICAL_ALLOWLIST.orphanCardPurchaseFingerprints.size,
    ).toBe(47);
    expect(APPROVED_HISTORICAL_ALLOWLIST.statementTotalFingerprints.size).toBe(
      8,
    );
    for (const fp of [
      ...APPROVED_HISTORICAL_ALLOWLIST.orphanCardPurchaseFingerprints,
      ...APPROVED_HISTORICAL_ALLOWLIST.statementTotalFingerprints,
    ]) {
      expect(fp).toMatch(/^[0-9a-f]{64}$/);
    }
  });
});

describe("applyHistoricalExceptions", () => {
  it("suppresses exact allowlisted rows as recognized exceptions, not drift", () => {
    const allowlist = makeAllowlist([orphanA, orphanB], [statementA]);
    const { checks, summary } = applyHistoricalExceptions(
      buildChecks([orphanA, orphanB], [statementA]),
      { orphans: [orphanA, orphanB], statements: [statementA] },
      allowlist,
    );
    const report = buildReport(checks, {
      schema: "legacy",
      generatedAt: "2026-09-18T00:00:00.000Z",
    });
    expect(report.totals.drifted).toBe(0);
    expect(summary.version).toBe("test-allowlist-v1");
    expect(summary.orphanCardPurchases).toMatchObject({
      expected: 2,
      matched: 2,
    });
    expect(summary.statementTotals).toMatchObject({ expected: 1, matched: 1 });
    expect(
      summary.orphanCardPurchases.recognized.map((r) => r.entityId).sort(),
    ).toEqual(["cp-a", "cp-b"]);
    // checked accounting is preserved: rows were still examined.
    expect(report.totals.checked).toBe(3);
  });

  it("keeps a changed fingerprint as active drift and raises the count gate", () => {
    const allowlist = makeAllowlist([orphanA, orphanB], [statementA]);
    const changed: OrphanExceptionSource = { ...orphanB, amountCents: 2501 };
    const { checks, summary } = applyHistoricalExceptions(
      buildChecks([orphanA, changed], [statementA]),
      { orphans: [orphanA, changed], statements: [statementA] },
      allowlist,
    );
    const report = buildReport(checks, {
      schema: "legacy",
      generatedAt: "2026-09-18T00:00:00.000Z",
    });
    // The tampered row stays visible as active orphan drift...
    const duplicates = checks.find((c) => c.check === "duplicates");
    expect(
      duplicates?.findings.some(
        (f) => f.kind === "orphan_card_purchase" && f.entityId === "cp-b",
      ),
    ).toBe(true);
    // ...the gate fires (1 matched of 2 expected), so --fail-on-drift exits 1.
    expect(summary.orphanCardPurchases.matched).toBe(1);
    expect(
      duplicates?.findings.some(
        (f) => f.kind === "historical_exception_count_mismatch",
      ),
    ).toBe(true);
    expect(report.totals.drifted).toBeGreaterThan(0);
  });

  it("keeps a non-allowlisted new orphan as drift", () => {
    const allowlist = makeAllowlist([orphanA], []);
    const fresh: OrphanExceptionSource = {
      cardPurchaseId: "cp-fresh",
      householdId: "h1",
      statementId: "s9",
      accountId: "a9",
      amountCents: 777,
      purchaseDate: "2026-09-01",
      description: "Fresh",
      transactionId: null,
    };
    const { checks } = applyHistoricalExceptions(
      buildChecks([orphanA, fresh], []),
      { orphans: [orphanA, fresh], statements: [] },
      allowlist,
    );
    const report = buildReport(checks, {
      schema: "legacy",
      generatedAt: "2026-09-18T00:00:00.000Z",
    });
    const duplicates = checks.find((c) => c.check === "duplicates");
    expect(
      duplicates?.findings.some(
        (f) => f.kind === "orphan_card_purchase" && f.entityId === "cp-fresh",
      ),
    ).toBe(true);
    expect(report.totals.drifted).toBeGreaterThan(0);
  });

  it("fails the gate when an expected fingerprint is missing", () => {
    const allowlist = makeAllowlist([orphanA, orphanB], [statementA]);
    const { checks, summary } = applyHistoricalExceptions(
      buildChecks([orphanA], []),
      { orphans: [orphanA], statements: [] },
      allowlist,
    );
    const report = buildReport(checks, {
      schema: "legacy",
      generatedAt: "2026-09-18T00:00:00.000Z",
    });
    expect(summary.orphanCardPurchases.matched).toBe(1);
    expect(summary.statementTotals.matched).toBe(0);
    expect(report.totals.drifted).toBeGreaterThan(0);
  });

  it("keeps a changed description as active drift and raises the count gate", () => {
    const allowlist = makeAllowlist([orphanA, orphanB], [statementA]);
    const renamed: OrphanExceptionSource = {
      ...orphanB,
      description: "Books (edited)",
    };
    const { checks, summary } = applyHistoricalExceptions(
      buildChecks([orphanA, renamed], [statementA]),
      { orphans: [orphanA, renamed], statements: [statementA] },
      allowlist,
    );
    const report = buildReport(checks, {
      schema: "legacy",
      generatedAt: "2026-09-18T00:00:00.000Z",
    });
    const duplicates = checks.find((c) => c.check === "duplicates");
    expect(
      duplicates?.findings.some(
        (f) => f.kind === "orphan_card_purchase" && f.entityId === "cp-b",
      ),
    ).toBe(true);
    expect(summary.orphanCardPurchases.matched).toBe(1);
    expect(
      duplicates?.findings.some(
        (f) => f.kind === "historical_exception_count_mismatch",
      ),
    ).toBe(true);
    expect(report.totals.drifted).toBeGreaterThan(0);
  });

  it("enforces the full expected set for the matching household scope", () => {
    const allowlist = makeAllowlist([orphanA, orphanB], [statementA]);
    const { checks, summary } = applyHistoricalExceptions(
      buildChecks([orphanA], []),
      { orphans: [orphanA], statements: [] },
      allowlist,
      "h1",
    );
    const report = buildReport(checks, {
      schema: "legacy",
      generatedAt: "2026-09-18T00:00:00.000Z",
    });
    expect(summary.orphanCardPurchases).toMatchObject({
      expected: 2,
      matched: 1,
    });
    expect(summary.statementTotals).toMatchObject({ expected: 1, matched: 0 });
    expect(report.totals.drifted).toBeGreaterThan(0);
  });

  it("expects zero known exceptions for an unrelated household scope", () => {
    const allowlist = makeAllowlist([orphanA, orphanB], [statementA]);
    const { checks, summary } = applyHistoricalExceptions(
      buildChecks([], []),
      { orphans: [], statements: [] },
      allowlist,
      "unrelated-household",
    );
    const report = buildReport(checks, {
      schema: "legacy",
      generatedAt: "2026-09-18T00:00:00.000Z",
    });
    expect(summary.orphanCardPurchases).toMatchObject({
      expected: 0,
      matched: 0,
    });
    expect(summary.statementTotals).toMatchObject({ expected: 0, matched: 0 });
    expect(report.totals.drifted).toBe(0);
  });
});
