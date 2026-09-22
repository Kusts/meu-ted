import { describe, expect, it } from "vitest";
import {
  buildCanonicalConversionPreflight,
  buildPostMigrationV055Gate,
  isSelectOnly,
  PREFLIGHT_QUERIES,
  runCanonicalConversionPreflight,
} from "../../src/scripts/canonical-conversion-preflight.js";

describe("canonical conversion preflight", () => {
  it("allows a clean legacy snapshot while reporting bank defaults and unlinked payments", () => {
    const report = buildCanonicalConversionPreflight({
      legacyAccounts: 3,
      orphanTransactions: 0,
      orphanCardPurchases: 0,
      duplicateCategories: 0,
      duplicateStatements: 0,
      usersMissingEmail: 0,
      membershipsUnresolved: 0,
      invitesUnresolved: 0,
      unlinkedStatementPayments: 4,
    });

    expect(report.ready).toBe(true);
    expect(report.findings).toEqual([
      expect.objectContaining({ code: "legacy_accounts_default_to_bank", blocker: false, count: 3 }),
      expect.objectContaining({ code: "unlinked_statement_payments", blocker: false, count: 4 }),
    ]);
  });

  it("blocks all ambiguous or invalid entities without proposing repairs", () => {
    const report = buildCanonicalConversionPreflight({
      legacyAccounts: 0,
      orphanTransactions: 2,
      orphanCardPurchases: 1,
      duplicateCategories: 3,
      duplicateStatements: 4,
      usersMissingEmail: 5,
      membershipsUnresolved: 6,
      invitesUnresolved: 7,
      unlinkedStatementPayments: 0,
    });

    expect(report.ready).toBe(false);
    expect(report.findings.filter((finding) => finding.blocker)).toHaveLength(7);
    expect(report.findings.every((finding) => finding.repair === undefined)).toBe(true);
  });

  it("uses SELECT-only queries for every database observation", () => {
    for (const query of Object.values(PREFLIGHT_QUERIES)) {
      expect(isSelectOnly(query)).toBe(true);
    }
  });

  it("blocks a converted clone until V055 has the card-only constraint", () => {
    expect(
      buildPostMigrationV055Gate({
        legacyBalanceConstraintPresent: true,
        cardOnlyConstraintPresent: false,
      }).ready,
    ).toBe(false);
    expect(
      buildPostMigrationV055Gate({
        legacyBalanceConstraintPresent: false,
        cardOnlyConstraintPresent: true,
      }).ready,
    ).toBe(true);
  });

  it("collects every query before returning a blocking report", async () => {
    const seen: string[] = [];
    const report = await runCanonicalConversionPreflight(async (query) => {
      seen.push(query);
      return [{ count: query === PREFLIGHT_QUERIES.orphanTransactions ? 1 : 0 }];
    });

    expect(seen).toHaveLength(Object.keys(PREFLIGHT_QUERIES).length);
    expect(report.ready).toBe(false);
    expect(report.findings).toContainEqual(
      expect.objectContaining({ code: "orphan_transactions", blocker: true, count: 1 }),
    );
  });
});
