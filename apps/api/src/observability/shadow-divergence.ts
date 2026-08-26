import { randomUUID } from "node:crypto";

export type ShadowDivergenceOutcome = "match" | "divergence" | "legacy_error" | "api_error" | "skipped";

export type ShadowDivergenceEvent = {
  id: string;
  workspaceId: string;
  capability: string;
  outcome: ShadowDivergenceOutcome;
  requestHash: string;
  apiHash?: string | null;
  legacyHash?: string | null;
  durationMs: number;
  error?: string | null;
  createdAt: string;
};

export type RecordShadowDivergenceInput = {
  workspaceId: string;
  capability: string;
  outcome: ShadowDivergenceOutcome;
  requestHash: string;
  apiHash?: string | null;
  legacyHash?: string | null;
  durationMs: number;
  error?: string | null;
};

export type ShadowDivergenceSummary = {
  capability: string;
  totalRuns: number;
  matches: number;
  divergences: number;
  legacyErrors: number;
  apiErrors: number;
  divergenceRate: number;
};

export interface ShadowDivergenceStore {
  recordEvent(input: RecordShadowDivergenceInput): Promise<ShadowDivergenceEvent>;
  getSummary(workspaceId: string, options?: { from?: string; to?: string }): Promise<ShadowDivergenceSummary[]>;
  listEvents(workspaceId: string, options?: { capability?: string; limit?: number }): Promise<ShadowDivergenceEvent[]>;
}

export const createInMemoryShadowDivergenceStore = (): ShadowDivergenceStore => {
  const events: ShadowDivergenceEvent[] = [];

  return {
    async recordEvent(input: RecordShadowDivergenceInput): Promise<ShadowDivergenceEvent> {
      const event: ShadowDivergenceEvent = {
        id: randomUUID(),
        workspaceId: input.workspaceId,
        capability: input.capability,
        outcome: input.outcome,
        requestHash: input.requestHash,
        apiHash: input.apiHash ?? null,
        legacyHash: input.legacyHash ?? null,
        durationMs: Math.max(0, input.durationMs),
        error: input.error ?? null,
        createdAt: new Date().toISOString(),
      };
      events.push(event);
      return event;
    },

    async getSummary(workspaceId: string, _options?: { from?: string; to?: string }): Promise<ShadowDivergenceSummary[]> {
      const scoped = events.filter((e) => e.workspaceId === workspaceId);
      const byCapability = new Map<string, ShadowDivergenceEvent[]>();
      for (const e of scoped) {
        const list = byCapability.get(e.capability) ?? [];
        list.push(e);
        byCapability.set(e.capability, list);
      }

      const summaries: ShadowDivergenceSummary[] = [];
      for (const [capability, capEvents] of byCapability.entries()) {
        const totalRuns = capEvents.length;
        const matches = capEvents.filter((e) => e.outcome === "match").length;
        const divergences = capEvents.filter((e) => e.outcome === "divergence").length;
        const legacyErrors = capEvents.filter((e) => e.outcome === "legacy_error").length;
        const apiErrors = capEvents.filter((e) => e.outcome === "api_error").length;
        const divergenceRate = totalRuns > 0 ? divergences / totalRuns : 0;
        summaries.push({
          capability,
          totalRuns,
          matches,
          divergences,
          legacyErrors,
          apiErrors,
          divergenceRate,
        });
      }
      return summaries.sort((a, b) => a.capability.localeCompare(b.capability));
    },

    async listEvents(workspaceId: string, options?: { capability?: string; limit?: number }): Promise<ShadowDivergenceEvent[]> {
      let scoped = events.filter((e) => e.workspaceId === workspaceId);
      if (options?.capability) {
        scoped = scoped.filter((e) => e.capability === options.capability);
      }
      scoped.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      if (options?.limit) {
        scoped = scoped.slice(0, options.limit);
      }
      return scoped;
    },
  };
};
