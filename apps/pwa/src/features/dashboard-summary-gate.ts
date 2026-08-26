/**
 * Dashboard Summary Gate (G5.2.9 boundary)
 * Ensures that monetary aggregates are strictly server-owned and never fabricated
 * client-side from partial snapshots.
 */

export interface DashboardSummaryServerResponse {
  source: "server";
  totals?: {
    incomeCents?: number;
    expenseCents?: number;
    balanceCents?: number;
  };
  generatedAt?: string;
  [key: string]: unknown;
}

export const dashboardSummary: DashboardSummaryServerResponse = {
  source: "server",
};

export interface DashboardSummaryGateInput {
  serverSummary: unknown;
}

export function dashboardSummaryGate(input?: DashboardSummaryGateInput | null): boolean {
  if (!input || input.serverSummary === null || input.serverSummary === undefined) {
    return false;
  }
  if (typeof input.serverSummary === "object" && input.serverSummary !== null) {
    return true;
  }
  return false;
}

export interface PartialSnapshotInput {
  syncedAt: string | null;
  txCount?: number;
  [key: string]: unknown;
}

export function aggregateFromSnapshot(snapshot: PartialSnapshotInput): unknown | null {
  if (!snapshot || snapshot.syncedAt === null) {
    return null;
  }
  return null;
}
