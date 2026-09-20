import { describe, expect, it } from "vitest";
import { buildReconciliationQueries } from "../../src/scripts/reconciliation/sql.js";
import { detectStatementPaymentDrift } from "../../src/scripts/reconciliation/detectors.js";

/**
 * debt-canonical-coverage-per-statement-fix (reviewer MEDIUM #2):
 * canonical reconciliation must validate payment coverage per statement,
 * not aggregate household+cycle, so cross-linked payments between two
 * statements in the same cycle cannot mask drift. Legacy stays on the
 * cycle-aggregate description match. V056 structured link is preserved.
 */
describe("canonical per-statement payment coverage", () => {
  it("canonical coverage selects one row per statement linked directly, never cycle-aggregated", () => {
    const text = buildReconciliationQueries("canonical", {}).statement_payment_coverage.text;
    // Per-statement grain: the paid statement id is projected...
    expect(text).toMatch(/s\.id\s+AS\s+statement_id/);
    // ...and the payment leg joins directly on the V056 FK...
    expect(text).toMatch(/t\.statement_payment_id\s*=\s*s\.id/);
    // ...with no free-text description selector on the canonical path.
    expect(text).not.toMatch(/Pagamento fatura/);
    expect(text).not.toMatch(/t\.description\s*=/);
    // ...and no cycle-level aggregation that could mask cross-links.
    expect(text).not.toMatch(/SUM\(s\.paid_cents\)/);
    expect(text).not.toMatch(/GROUP BY s\.household_id,\s*s\.cycle_year_month/);
  });

  it("genuine per-statement canonical payments pass with zero drift", () => {
    const result = detectStatementPaymentDrift(
      [],
      [
        {
          householdId: "h-per",
          cycle: "2026-08",
          statementsPaidSum: 3000,
          paymentTxSumCents: 3000,
          statementCount: 1,
          statementId: "s-A",
        },
        {
          householdId: "h-per",
          cycle: "2026-08",
          statementsPaidSum: 1000,
          paymentTxSumCents: 1000,
          statementCount: 1,
          statementId: "s-B",
        },
      ],
    );
    expect(
      result.findings.filter((f) => f.kind === "payment_coverage_gap"),
    ).toHaveLength(0);
  });

  it("a payment linked to the wrong same-cycle statement causes active per-statement drift", () => {
    // Two statements, same cycle, different amounts; the 3000 payment was
    // linked to s-B and the 1000 payment to s-A (swapped). A household+cycle
    // aggregate (4000 vs 4000) would mask this; per-statement must not.
    const result = detectStatementPaymentDrift(
      [],
      [
        {
          householdId: "h-per",
          cycle: "2026-08",
          statementsPaidSum: 3000,
          paymentTxSumCents: 1000,
          statementCount: 1,
          statementId: "s-A",
        },
        {
          householdId: "h-per",
          cycle: "2026-08",
          statementsPaidSum: 1000,
          paymentTxSumCents: 3000,
          statementCount: 1,
          statementId: "s-B",
        },
      ],
    );
    const gaps = result.findings.filter((f) => f.kind === "payment_coverage_gap");
    expect(gaps).toHaveLength(2);
    expect(gaps.map((f) => f.entityId).sort()).toEqual(["s-A", "s-B"]);
    expect(gaps.every((f) => f.entity === "statements")).toBe(true);
  });

  it("legacy coverage stays cycle-aggregated on description matching", () => {
    const text = buildReconciliationQueries("legacy", {}).statement_payment_coverage.text;
    expect(text).toMatch(/Pagamento fatura/);
    expect(text).toMatch(/GROUP BY s\.household_id,\s*s\.cycle_year_month/);
  });
});
