import type { DbPool } from "../db/pool.js";

export const ADOPTION_EVENT_TYPES = [
  "notification_delivered",
  "notification_opened",
  "chat_used",
  "capture_started",
  "capture_completed",
] as const;

export type AdoptionEventType = (typeof ADOPTION_EVENT_TYPES)[number];

export type AdoptionEvent = {
  workspaceId: string;
  actorId: string;
  eventType: AdoptionEventType;
  occurredAt: Date;
  flowId?: string;
  dedupeKey?: string;
};

export type AdoptionFunnel = {
  from: string;
  to: string;
  delivered: number;
  opened: number;
  chatUsed: number;
  capturesStarted: number;
  capturesCompleted: number;
  openRate: number;
  chatRate: number;
  captureStartRate: number;
  captureCompletionRate: number;
  captureDurationMedianMs: number | null;
  captureDurationP95Ms: number | null;
};

export interface AdoptionStore {
  record(event: AdoptionEvent): Promise<void>;
  funnel(input: {
    workspaceId: string;
    from: Date;
    to: Date;
  }): Promise<AdoptionFunnel>;
}

const emptyFunnel = (from: Date, to: Date): AdoptionFunnel => ({
  from: from.toISOString().slice(0, 10),
  to: to.toISOString().slice(0, 10),
  delivered: 0,
  opened: 0,
  chatUsed: 0,
  capturesStarted: 0,
  capturesCompleted: 0,
  openRate: 0,
  chatRate: 0,
  captureStartRate: 0,
  captureCompletionRate: 0,
  captureDurationMedianMs: null,
  captureDurationP95Ms: null,
});

const ratio = (value: number, denominator: number): number =>
  denominator === 0 ? 0 : Number((value / denominator).toFixed(4));

export const createInMemoryAdoptionStore = (): AdoptionStore => {
  const events: AdoptionEvent[] = [];
  const dedupeKeys = new Set<string>();

  return {
    async record(event) {
      const dedupeKey = event.dedupeKey
        ? `${event.workspaceId}:${event.dedupeKey}`
        : undefined;
      if (dedupeKey && dedupeKeys.has(dedupeKey)) return;
      if (dedupeKey) dedupeKeys.add(dedupeKey);
      events.push(event);
    },
    async funnel({ workspaceId, from, to }) {
      const selected = events.filter(
        (event) =>
          event.workspaceId === workspaceId &&
          event.occurredAt >= from &&
          event.occurredAt <= to,
      );
      const count = (eventType: AdoptionEventType) =>
        selected.filter((event) => event.eventType === eventType).length;
      const delivered = count("notification_delivered");
      const opened = count("notification_opened");
      const chatUsed = count("chat_used");
      const capturesStarted = count("capture_started");
      const capturesCompleted = count("capture_completed");
      const durations = selected
        .filter(
          (event) => event.eventType === "capture_completed" && event.flowId,
        )
        .map((completed) => {
          const started = selected.find(
            (event) =>
              event.eventType === "capture_started" &&
              event.flowId === completed.flowId &&
              event.occurredAt <= completed.occurredAt,
          );
          return started
            ? completed.occurredAt.getTime() - started.occurredAt.getTime()
            : undefined;
        })
        .filter((duration): duration is number => duration !== undefined)
        .sort((a, b) => a - b);
      const percentile = (p: number) =>
        durations.length === 0
          ? null
          : (durations[
              Math.min(
                durations.length - 1,
                Math.ceil(durations.length * p) - 1,
              )
            ] ?? null);

      return {
        ...emptyFunnel(from, to),
        delivered,
        opened,
        chatUsed,
        capturesStarted,
        capturesCompleted,
        openRate: ratio(opened, delivered),
        chatRate: ratio(chatUsed, opened),
        captureStartRate: ratio(capturesStarted, chatUsed),
        captureCompletionRate: ratio(capturesCompleted, capturesStarted),
        captureDurationMedianMs: percentile(0.5),
        captureDurationP95Ms: percentile(0.95),
      };
    },
  };
};

export const createPostgresAdoptionStore = (pool: DbPool): AdoptionStore => ({
  async record(event) {
    await pool.query(
      `INSERT INTO adoption_events (workspace_id, actor_id, event_type, occurred_at, flow_id, dedupe_key)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (workspace_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING`,
      [
        event.workspaceId,
        event.actorId,
        event.eventType,
        event.occurredAt,
        event.flowId ?? null,
        event.dedupeKey ?? null,
      ],
    );
  },
  async funnel({ workspaceId, from, to }) {
    const result = await pool.query<{
      delivered: number;
      opened: number;
      chat_used: number;
      captures_started: number;
      captures_completed: number;
      median_ms: number | null;
      p95_ms: number | null;
    }>(
      `WITH selected AS (
         SELECT event_type, flow_id, occurred_at
         FROM adoption_events
         WHERE workspace_id = $1 AND occurred_at >= $2 AND occurred_at <= $3
      ), counts AS (
        SELECT
          COUNT(*) FILTER (WHERE event_type = 'notification_delivered')::int AS delivered,
          COUNT(*) FILTER (WHERE event_type = 'notification_opened')::int AS opened,
          COUNT(*) FILTER (WHERE event_type = 'chat_used')::int AS chat_used,
          COUNT(*) FILTER (WHERE event_type = 'capture_started')::int AS captures_started,
          COUNT(*) FILTER (WHERE event_type = 'capture_completed')::int AS captures_completed
        FROM selected
      ), capture_pairs AS (
        SELECT DISTINCT ON (started.flow_id, started.occurred_at)
          EXTRACT(EPOCH FROM (completed.occurred_at - started.occurred_at)) * 1000 AS duration_ms
        FROM selected started
        JOIN LATERAL (
          SELECT candidate.occurred_at
          FROM selected candidate
          WHERE candidate.event_type = 'capture_completed'
            AND candidate.flow_id = started.flow_id
            AND candidate.occurred_at >= started.occurred_at
          ORDER BY candidate.occurred_at
          LIMIT 1
        ) completed ON TRUE
        WHERE started.event_type = 'capture_started'
      )
       SELECT counts.*, percentile_cont(0.5) WITHIN GROUP (ORDER BY duration_ms) AS median_ms,
              percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms) AS p95_ms
       FROM counts LEFT JOIN capture_pairs ON TRUE
       GROUP BY counts.delivered, counts.opened, counts.chat_used,
                counts.captures_started, counts.captures_completed`,
      [workspaceId, from, to],
    );
    const row = result.rows[0];
    if (!row) return emptyFunnel(from, to);
    return {
      ...emptyFunnel(from, to),
      delivered: Number(row.delivered),
      opened: Number(row.opened),
      chatUsed: Number(row.chat_used),
      capturesStarted: Number(row.captures_started),
      capturesCompleted: Number(row.captures_completed),
      openRate: ratio(Number(row.opened), Number(row.delivered)),
      chatRate: ratio(Number(row.chat_used), Number(row.opened)),
      captureStartRate: ratio(
        Number(row.captures_started),
        Number(row.chat_used),
      ),
      captureCompletionRate: ratio(
        Number(row.captures_completed),
        Number(row.captures_started),
      ),
      captureDurationMedianMs:
        row.median_ms === null ? null : Number(row.median_ms),
      captureDurationP95Ms: row.p95_ms === null ? null : Number(row.p95_ms),
    };
  },
});
