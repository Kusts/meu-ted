/**
 * TDD-RED spec — Restored by coordinator (2026-08-19) after agy deleted it.
 * Canonical source: docs/ops/2026-08-18-boundary-tests-diagnosis.md
 * Invariant required (G5.2.9): the persisted UI must NOT render fabricated
 * monetary aggregates without a server-issued summary (GET /dashboard/summary).
 * This file is RED by design until the invariant exists (Item 28 — Fase 3 G3).
 */
import { describe, it, expect } from "vitest";

describe("Persisted UI boundary (G5.2.9)", () => {
  it("does not render monetary aggregates when the server summary is missing", async () => {
    // The feature must gate dashboard totals behind a server-issued summary.
    // Until GET /dashboard/summary exists, only server-owned aggregates may render.
    const { dashboardSummaryGate } = await import("../dashboard-summary-gate");
    expect(dashboardSummaryGate).toBeDefined();
    expect(dashboardSummaryGate({ serverSummary: null })).toBe(false);
    expect(
      dashboardSummaryGate({ serverSummary: { totals: { incomeCents: 1 } } }),
    ).toBe(true);
  });
});