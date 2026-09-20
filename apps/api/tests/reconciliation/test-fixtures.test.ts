import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  buildReport,
  detectPayablePaymentDrift,
  detectStatementPaymentDrift,
} from "../../src/scripts/reconciliation/detectors.js";
import type { CheckResult } from "../../src/scripts/reconciliation/detectors.js";
import {
  APPROVED_TEST_FIXTURE_ALLOWLIST,
  EXPECTED_TEST_FIXTURE_COVERAGE,
  EXPECTED_TEST_FIXTURE_PAYABLES,
  TEST_FIXTURE_EXCEPTION_VERSION,
  applyTestFixtureExceptions,
  fingerprintPayablePayment,
  fingerprintStatementCoverage,
  hashTestFixtureScope,
} from "../../src/scripts/reconciliation/test-fixtures.js";
import type {
  PayableFixtureSource,
  StatementCoverageFixtureSource,
  TestFixtureAllowlist,
} from "../../src/scripts/reconciliation/test-fixtures.js";

const sha256 = (preimage: string): string =>
  createHash("sha256").update(preimage, "utf8").digest("hex");

const coverageA: StatementCoverageFixtureSource = {
  householdId: "h-test",
  cycle: "2026-03",
  statementsPaidSum: 72360,
  paymentTxSumCents: 0,
  statementCount: 1,
};

const coverageB: StatementCoverageFixtureSource = {
  householdId: "h-test",
  cycle: "2026-04",
  statementsPaidSum: 158560,
  paymentTxSumCents: 0,
  statementCount: 1,
};

const coverageC: StatementCoverageFixtureSource = {
  householdId: "h-test",
  cycle: "2026-05",
  statementsPaidSum: 499250,
  paymentTxSumCents: 0,
  statementCount: 1,
};

const payableA: PayableFixtureSource = {
  payableId: "p-a",
  householdId: "h-test",
  accountId: "a1",
  description: "Rent",
  amountCents: 100000,
  status: "paid",
  paidDate: "2026-05-10",
  paidTransactionId: "t-a",
  paidTxExists: false,
  paidTxDeleted: true,
  paymentTxCount: 0,
};

const payableB: PayableFixtureSource = {
  payableId: "p-b",
  householdId: "h-test",
  accountId: "a1",
  description: "Power",
  amountCents: 25000,
  status: "paid",
  paidDate: null,
  paidTransactionId: "t-b",
  paidTxExists: false,
  paidTxDeleted: true,
  paymentTxCount: 0,
};

const makeAllowlist = (
  coverages: StatementCoverageFixtureSource[],
  payables: PayableFixtureSource[],
): TestFixtureAllowlist => ({
  version: "test-fixture-allowlist-v1",
  coverageFingerprints: new Set(coverages.map(fingerprintStatementCoverage)),
  payableFingerprints: new Set(payables.map(fingerprintPayablePayment)),
  expectedCoverage: coverages.length,
  expectedPayables: payables.length,
  approvedHouseholdScopeHash: hashTestFixtureScope("h-test"),
});

const buildChecks = (
  coverages: StatementCoverageFixtureSource[],
  payables: PayableFixtureSource[],
): CheckResult[] => [
  detectStatementPaymentDrift(
    [],
    coverages.map((c) => ({
      householdId: c.householdId,
      cycle: c.cycle,
      statementsPaidSum: c.statementsPaidSum,
      paymentTxSumCents: c.paymentTxSumCents,
      statementCount: c.statementCount,
    })),
  ),
  detectPayablePaymentDrift(
    payables.map((p) => ({
      payableId: p.payableId,
      householdId: p.householdId,
      status: p.status,
      amountCents: p.amountCents,
      paidAmountCents: p.amountCents,
      paidTransactionId: p.paidTransactionId,
      paidTxExists: p.paidTxExists,
      paidTxDeleted: p.paidTxDeleted,
      paymentTxCount: p.paymentTxCount,
    })),
  ),
];

describe("test fixture fingerprints (ADR-019)", () => {
  it("pins the exact coverage fingerprint format", () => {
    expect(fingerprintStatementCoverage(coverageA)).toBe(
      sha256("statement_payment_coverage:h-test:2026-03:72360:0:1"),
    );
  });

  it("pins the exact payable fingerprint format", () => {
    expect(fingerprintPayablePayment(payableA)).toBe(
      sha256(
        "payable_payment:p-a:h-test:a1:Rent:100000:paid:2026-05-10:t-a:false:true:0",
      ),
    );
    expect(fingerprintPayablePayment(payableB)).toBe(
      sha256(
        "payable_payment:p-b:h-test:a1:Power:25000:paid::t-b:false:true:0",
      ),
    );
  });

  it("ships the approved ADR-019 counts with hash-only entries", () => {
    expect(TEST_FIXTURE_EXCEPTION_VERSION).toBe("adr-019-test-fixtures-v1");
    expect(EXPECTED_TEST_FIXTURE_COVERAGE).toBe(3);
    expect(EXPECTED_TEST_FIXTURE_PAYABLES).toBe(2);
    expect(APPROVED_TEST_FIXTURE_ALLOWLIST.coverageFingerprints.size).toBe(3);
    expect(APPROVED_TEST_FIXTURE_ALLOWLIST.payableFingerprints.size).toBe(2);
    expect(APPROVED_TEST_FIXTURE_ALLOWLIST.coverageFingerprints).toEqual(
      new Set([
        "2de99015874335b128da0cd29700514362266526941086c20764519d2825da55",
        "95375375ac14898f4da6bce40ac4128136e7faf0573015d97b8ffc15576061cf",
        "53f9423d09912f642391369a5de470cc1f149effe9b8ba30e0e46ac72cf62c80",
      ]),
    );
    expect(APPROVED_TEST_FIXTURE_ALLOWLIST.payableFingerprints).toEqual(
      new Set([
        "6429d196ab2ca36873e9940be15a69419f4cd1a81185de6a1dc51116d6f484e5",
        "0ac4d5ffb88440f81529a5c12ae6fbfcf1f8980af32a8a86c88bbf02f47f6ec9",
      ]),
    );
    for (const fp of [
      ...APPROVED_TEST_FIXTURE_ALLOWLIST.coverageFingerprints,
      ...APPROVED_TEST_FIXTURE_ALLOWLIST.payableFingerprints,
    ]) {
      expect(fp).toMatch(/^[0-9a-f]{64}$/);
    }
  });
});

describe("applyTestFixtureExceptions", () => {
  it("suppresses exact allowlisted rows as recognized exceptions, not drift", () => {
    const allowlist = makeAllowlist(
      [coverageA, coverageB, coverageC],
      [payableA, payableB],
    );
    const { checks, summary } = applyTestFixtureExceptions(
      buildChecks([coverageA, coverageB, coverageC], [payableA, payableB]),
      {
        coverages: [coverageA, coverageB, coverageC],
        payables: [payableA, payableB],
      },
      allowlist,
    );
    const report = buildReport(checks, {
      schema: "legacy",
      generatedAt: "2026-09-18T00:00:00.000Z",
    });
    expect(report.totals.drifted).toBe(0);
    expect(summary.version).toBe("test-fixture-allowlist-v1");
    expect(summary.coverage).toMatchObject({ expected: 3, matched: 3 });
    expect(summary.payables).toMatchObject({ expected: 2, matched: 2 });
    // checked accounting is preserved: rows were still examined.
    expect(report.totals.checked).toBe(5);
  });

  it("keeps a non-allowlisted coverage gap and payable as active drift", () => {
    const freshCoverage: StatementCoverageFixtureSource = {
      householdId: "h-test",
      cycle: "2026-06",
      statementsPaidSum: 1000,
      paymentTxSumCents: 0,
      statementCount: 1,
    };
    const freshPayable: PayableFixtureSource = {
      ...payableB,
      payableId: "p-fresh",
    };
    const { checks } = applyTestFixtureExceptions(
      buildChecks([coverageA, freshCoverage], [payableA, freshPayable]),
      {
        coverages: [coverageA, freshCoverage],
        payables: [payableA, freshPayable],
      },
      makeAllowlist([coverageA, coverageB, coverageC], [payableA, payableB]),
    );
    const statementPayment = checks.find(
      (c) => c.check === "statement_payment",
    );
    expect(
      statementPayment?.findings.some(
        (f) =>
          f.kind === "payment_coverage_gap" && f.entityId === "h-test|2026-06",
      ),
    ).toBe(true);
    const payablePayment = checks.find((c) => c.check === "payable_payment");
    expect(
      payablePayment?.findings.some(
        (f) =>
          f.kind === "missing_payment_transaction" && f.entityId === "p-fresh",
      ),
    ).toBe(true);
  });

  it("keeps a changed fixture as active drift and raises the count gate", () => {
    const allowlist = makeAllowlist(
      [coverageA, coverageB, coverageC],
      [payableA, payableB],
    );
    const changed: PayableFixtureSource = { ...payableB, amountCents: 25001 };
    const { checks, summary } = applyTestFixtureExceptions(
      buildChecks([coverageA, coverageB, coverageC], [payableA, changed]),
      {
        coverages: [coverageA, coverageB, coverageC],
        payables: [payableA, changed],
      },
      allowlist,
    );
    const report = buildReport(checks, {
      schema: "legacy",
      generatedAt: "2026-09-18T00:00:00.000Z",
    });
    const payablePayment = checks.find((c) => c.check === "payable_payment");
    expect(
      payablePayment?.findings.some(
        (f) => f.kind === "missing_payment_transaction" && f.entityId === "p-b",
      ),
    ).toBe(true);
    expect(summary.payables.matched).toBe(1);
    expect(
      payablePayment?.findings.some(
        (f) => f.kind === "test_fixture_count_mismatch",
      ),
    ).toBe(true);
    expect(report.totals.drifted).toBeGreaterThan(0);
  });

  it("fails the gate when an expected fixture is missing", () => {
    const allowlist = makeAllowlist(
      [coverageA, coverageB, coverageC],
      [payableA, payableB],
    );
    const { checks, summary } = applyTestFixtureExceptions(
      buildChecks([coverageA, coverageB], [payableA]),
      { coverages: [coverageA, coverageB], payables: [payableA] },
      allowlist,
    );
    const report = buildReport(checks, {
      schema: "legacy",
      generatedAt: "2026-09-18T00:00:00.000Z",
    });
    expect(summary.coverage.matched).toBe(2);
    expect(summary.payables.matched).toBe(1);
    expect(report.totals.drifted).toBeGreaterThan(0);
  });

  it("enforces the full expected set for the matching household scope", () => {
    const allowlist = makeAllowlist(
      [coverageA, coverageB, coverageC],
      [payableA, payableB],
    );
    const { checks, summary } = applyTestFixtureExceptions(
      buildChecks([coverageA], [payableA]),
      { coverages: [coverageA], payables: [payableA] },
      allowlist,
      "h-test",
    );
    const report = buildReport(checks, {
      schema: "legacy",
      generatedAt: "2026-09-18T00:00:00.000Z",
    });
    expect(summary.coverage).toMatchObject({ expected: 3, matched: 1 });
    expect(summary.payables).toMatchObject({ expected: 2, matched: 1 });
    expect(report.totals.drifted).toBeGreaterThan(0);
  });

  it("expects zero known exceptions for an unrelated household scope", () => {
    const allowlist = makeAllowlist(
      [coverageA, coverageB, coverageC],
      [payableA, payableB],
    );
    const { checks, summary } = applyTestFixtureExceptions(
      buildChecks([], []),
      { coverages: [], payables: [] },
      allowlist,
      "unrelated-household",
    );
    const report = buildReport(checks, {
      schema: "legacy",
      generatedAt: "2026-09-18T00:00:00.000Z",
    });
    expect(summary.coverage).toMatchObject({ expected: 0, matched: 0 });
    expect(summary.payables).toMatchObject({ expected: 0, matched: 0 });
    expect(report.totals.drifted).toBe(0);
  });
});

describe("applyTestFixtureExceptions layout scoping (ADR-019 legacy-only)", () => {
  it("expects zero fixtures and no gate for canonical runs missing legacy-only coverage rows", () => {
    const allowlist = makeAllowlist(
      [coverageA, coverageB, coverageC],
      [payableA, payableB],
    );
    const { checks, summary } = applyTestFixtureExceptions(
      buildChecks([], []),
      { coverages: [], payables: [] },
      allowlist,
      undefined,
      "canonical",
    );
    const report = buildReport(checks, {
      schema: "canonical",
      generatedAt: "2026-09-18T00:00:00.000Z",
    });
    expect(summary.coverage).toMatchObject({ expected: 0, matched: 0 });
    expect(summary.payables).toMatchObject({ expected: 0, matched: 0 });
    expect(report.totals.drifted).toBe(0);
  });

  it("keeps the legacy 3+2 gate for the approved household scope", () => {
    const allowlist = makeAllowlist(
      [coverageA, coverageB, coverageC],
      [payableA, payableB],
    );
    const { checks, summary } = applyTestFixtureExceptions(
      buildChecks([coverageA], [payableA]),
      { coverages: [coverageA], payables: [payableA] },
      allowlist,
      "h-test",
      "legacy",
    );
    const report = buildReport(checks, {
      schema: "legacy",
      generatedAt: "2026-09-18T00:00:00.000Z",
    });
    expect(summary.coverage).toMatchObject({ expected: 3, matched: 1 });
    expect(summary.payables).toMatchObject({ expected: 2, matched: 1 });
    expect(report.totals.drifted).toBeGreaterThan(0);
  });

  it("never suppresses a canonical known-style payable finding", () => {
    const allowlist = makeAllowlist(
      [coverageA, coverageB, coverageC],
      [payableA, payableB],
    );
    const { checks, summary } = applyTestFixtureExceptions(
      buildChecks([], [payableA]),
      { coverages: [], payables: [payableA] },
      allowlist,
      undefined,
      "canonical",
    );
    const report = buildReport(checks, {
      schema: "canonical",
      generatedAt: "2026-09-18T00:00:00.000Z",
    });
    expect(summary.coverage).toMatchObject({ expected: 0, matched: 0 });
    expect(summary.payables).toMatchObject({ expected: 0, matched: 0 });
    const payablePayment = checks.find((c) => c.check === "payable_payment");
    expect(
      payablePayment?.findings.some(
        (f) => f.kind === "missing_payment_transaction" && f.entityId === "p-a",
      ),
    ).toBe(true);
    expect(report.totals.drifted).toBeGreaterThan(0);
  });
});
