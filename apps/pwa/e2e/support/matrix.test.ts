/**
 * Matrix gate tests — validates every action ID in the coverage matrix
 * has exactly one owning E2E spec, no duplicates, no unknowns.
 *
 * Run: node --experimental-strip-types --test e2e/support/matrix.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { auditCoverage } from "./matrix.ts";

describe("E2E coverage matrix gate", () => {
  const result = auditCoverage();

  it("finds no missing IDs (every matrix ID has an owning spec)", () => {
    assert.deepEqual(result.missing, [], `Missing: ${result.missing.join(", ")}`);
  });

  it("finds no unknown IDs (no spec [ID] absent from matrix)", () => {
    assert.deepEqual(result.unknown, [], `Unknown: ${result.unknown.join(", ")}`);
  });

  it("finds no duplicate IDs (no [ID] in more than one spec)", () => {
    assert.deepEqual(result.duplicate, [], `Duplicate: ${result.duplicate.join(", ")}`);
  });

  it("resolves all matrix action IDs", () => {
    assert.ok(result.matrixIds.length > 0, "Matrix extracted zero IDs");
    assert.equal(result.pass, true, "Coverage gate failed");
  });
});
