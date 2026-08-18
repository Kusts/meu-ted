import type { Pool } from "pg";
import type {
  RecordShadowDivergenceInput,
  ShadowDivergenceEvent,
  ShadowDivergenceOutcome,
  ShadowDivergenceStore,
  ShadowDivergenceSummary,
} from "./shadow-divergence.js";

type Row = Record<string, unknown>;

const mapEvent = (r: Row): ShadowDivergenceEvent => ({
  id: r["id"] as string,
  workspaceId: r["workspace_id"] as string,
  capability: r["capability"] as string,
  outcome: r["outcome"] as ShadowDivergenceOutcome,
  requestHash: r["request_hash"] as string,
  apiHash: (r["api_hash"] as string | null) ?? undefined,
  legacyHash: (r["legacy_hash"] as string | null) ?? undefined,
  durationMs: Number(r["duration_ms"] ?? 0),
  error: (r["error"] as string | null) ?? undefined,
  createdAt: (r["created_at"] instanceof Date ? r["created_at"] : new Date(r["created_at"] as string)).toISOString(),
});

export const createPostgresShadowDivergenceStore = (pool: Pool): ShadowDivergenceStore => {
  return {
    async recordEvent(input: RecordShadowDivergenceInput): Promise<ShadowDivergenceEvent> {
      const res = await pool.query<Row>(
        `INSERT INTO shadow_divergence_events (
           workspace_id, capability, outcome, request_hash, api_hash, legacy_hash, duration_ms, error
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, workspace_id, capability, outcome, request_hash, api_hash, legacy_hash, duration_ms, error, created_at`,
        [
          input.workspaceId,
          input.capability,
          input.outcome,
          input.requestHash,
          input.apiHash ?? null,
          input.legacyHash ?? null,
          Math.max(0, input.durationMs),
          input.error ?? null,
        ],
      );
      return mapEvent(res.rows[0]!);
    },

    async getSummary(workspaceId: string, options?: { from?: string; to?: string }): Promise<ShadowDivergenceSummary[]> {
      const conditions: string[] = ["workspace_id = $1"];
      const params: unknown[] = [workspaceId];

      if (options?.from) {
        params.push(options.from);
        conditions.push(`created_at >= $${params.length}::timestamptz`);
      }
      if (options?.to) {
        params.push(options.to);
        conditions.push(`created_at <= $${params.length}::timestamptz`);
      }

      const res = await pool.query<Row>(
        `SELECT
           capability,
           COUNT(*)::int AS total_runs,
           COUNT(*) FILTER (WHERE outcome = 'match')::int AS matches,
           COUNT(*) FILTER (WHERE outcome = 'divergence')::int AS divergences,
           COUNT(*) FILTER (WHERE outcome = 'legacy_error')::int AS legacy_errors,
           COUNT(*) FILTER (WHERE outcome = 'api_error')::int AS api_errors
         FROM shadow_divergence_events
         WHERE ${conditions.join(" AND ")}
         GROUP BY capability
         ORDER BY capability ASC`,
        params,
      );

      return res.rows.map((r) => {
        const totalRuns = Number(r["total_runs"] ?? 0);
        const divergences = Number(r["divergences"] ?? 0);
        return {
          capability: r["capability"] as string,
          totalRuns,
          matches: Number(r["matches"] ?? 0),
          divergences,
          legacyErrors: Number(r["legacy_errors"] ?? 0),
          apiErrors: Number(r["api_errors"] ?? 0),
          divergenceRate: totalRuns > 0 ? divergences / totalRuns : 0,
        };
      });
    },

    async listEvents(workspaceId: string, options?: { capability?: string; limit?: number }): Promise<ShadowDivergenceEvent[]> {
      const conditions: string[] = ["workspace_id = $1"];
      const params: unknown[] = [workspaceId];

      if (options?.capability) {
        params.push(options.capability);
        conditions.push(`capability = $${params.length}`);
      }

      const limit = Math.min(Math.max(1, options?.limit ?? 50), 100);
      params.push(limit);

      const res = await pool.query<Row>(
        `SELECT id, workspace_id, capability, outcome, request_hash, api_hash, legacy_hash, duration_ms, error, created_at
         FROM shadow_divergence_events
         WHERE ${conditions.join(" AND ")}
         ORDER BY created_at DESC
         LIMIT $${params.length}`,
        params,
      );

      return res.rows.map(mapEvent);
    },
  };
};
