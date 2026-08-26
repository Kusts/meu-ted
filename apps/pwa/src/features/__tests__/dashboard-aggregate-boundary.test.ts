/**
 * TDD-RED spec — Restored by coordinator (2026-08-19) after agy deleted it.
 * Canonical source: docs/ops/2026-08-18-boundary-tests-diagnosis.md
 * Invariant required (G5.2.9): monetary aggregates (income/expense/balance)
 * MUST be server-owned (computed by GET /dashboard/summary), never fabricated
 * client-side from a partial snapshot.
 * This file is RED by design until the invariant exists (Item 28 — Fase 3 G3).
 */
import { describe, it, expect } from "vitest";

describe("Dashboard aggregate boundary (G5.2.9)", () => {
  it("uses server-owned monetary aggregates from /dashboard/summary", async () => {
    const { dashboardSummary } = await import("../dashboard-summary-gate");
    expect(dashboardSummary).toBeDefined();
    expect(dashboardSummary.source).toBe("server");
  });

  it("rejects client-fabricated aggregates derived from a partial snapshot", async () => {
    const { aggregateFromSnapshot } = await import("../dashboard-summary-gate");
    // A partial local snapshot must not be promoted to a monetary total.
    expect(aggregateFromSnapshot({ syncedAt: null, txCount: 3 })).toBeNull();
  });
});