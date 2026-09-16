/**
 * Minimal client-side event recorder (V4 T0.4.7, SPEC §24.7 `mic.error`).
 *
 * Lightweight counters only — no new service, no beacon, no credentials.
 * Events queue durably in localStorage (bounded) and flush on the next
 * authenticated cycle through the canonical transport: POST /client-events
 * via the same-origin proxy (`apiFetch`, `credentials: "include"` — never a
 * direct absolute URL). The queue clears only on acknowledged send
 * (at-least-once). Telemetry never blocks the primary user action: flush
 * failures keep the queue and never throw into the request path.
 */

import { apiFetch } from "@/lib/api/client";

export type MicErrorReason = "denied" | "notfound" | "busy";

export type ClientEventType = "mic.error" | "offline.locked";

/**
 * Closed age-band enum for offline.locked (T2.6/T0.4.4, SPEC §24.4):
 * coarse bands only — never timestamps, durations or free text. Mirrors
 * the API-side OFFLINE_AGE_BANDS allowlist and the snapshot-db helper.
 */
export const OFFLINE_AGE_BANDS = ["<1d", "1-7d", "7-30d", ">30d"] as const;

export type OfflineAgeBand = (typeof OFFLINE_AGE_BANDS)[number];

export interface QueuedClientEvent {
  type: ClientEventType;
  /** mic.error only. */
  reason?: MicErrorReason;
  /** Value of the microphone capability flag when the error happened (mic.error only). */
  microphoneEnabled?: boolean;
  /** Active workspace UUID the locked snapshot belongs to (offline.locked only). */
  offlineSubjectId?: string;
  /** Coarse staleness band (offline.locked only). */
  ageBand?: OfflineAgeBand;
  occurredAt: string;
}

export const CLIENT_EVENTS_STORAGE_KEY = "pi-finance:client-events";

/** Canonical API path (same-origin proxy) — never an absolute URL. */
export const CLIENT_EVENTS_PATH = "/client-events";

const MAX_QUEUED_EVENTS = 100;

const VALID_REASONS: ReadonlySet<string> = new Set(["denied", "notfound", "busy"]);

const VALID_AGE_BANDS: ReadonlySet<string> = new Set(OFFLINE_AGE_BANDS);

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isQueuedClientEvent(entry: unknown): entry is QueuedClientEvent {
  if (typeof entry !== "object" || entry === null) return false;
  const type = (entry as { type?: unknown }).type;
  if (type === "mic.error") {
    return VALID_REASONS.has(String((entry as { reason?: unknown }).reason));
  }
  if (type === "offline.locked") {
    const subject = (entry as { offlineSubjectId?: unknown }).offlineSubjectId;
    const band = (entry as { ageBand?: unknown }).ageBand;
    return (
      typeof subject === "string" &&
      UUID_PATTERN.test(subject) &&
      typeof band === "string" &&
      VALID_AGE_BANDS.has(band)
    );
  }
  return false;
}

function readQueue(): QueuedClientEvent[] {
  try {
    if (typeof localStorage === "undefined") return [];
    const raw = localStorage.getItem(CLIENT_EVENTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isQueuedClientEvent);
  } catch {
    // Corrupt or unavailable storage — telemetry degrades to in-memory drop.
    return [];
  }
}

function writeQueue(queue: QueuedClientEvent[]): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(CLIENT_EVENTS_STORAGE_KEY, JSON.stringify(queue));
  } catch {
    /* storage full or blocked — telemetry must never throw */
  }
}

export function recordClientEvent(
  type: "mic.error",
  payload: { reason: string; microphoneEnabled: boolean },
): QueuedClientEvent;
export function recordClientEvent(
  type: "offline.locked",
  payload: { offlineSubjectId: string; ageBand: string },
): QueuedClientEvent;
export function recordClientEvent(
  type: ClientEventType,
  payload:
    | { reason: string; microphoneEnabled: boolean }
    | { offlineSubjectId: string; ageBand: string },
): QueuedClientEvent {
  let event: QueuedClientEvent;
  if (type === "mic.error" && "reason" in payload) {
    if (!VALID_REASONS.has(payload.reason)) {
      throw new Error(`[client-events] rejected unknown event: ${type}/${payload.reason}`);
    }
    event = {
      type,
      reason: payload.reason as MicErrorReason,
      microphoneEnabled: payload.microphoneEnabled,
      occurredAt: new Date().toISOString(),
    };
  } else if (type === "offline.locked" && "offlineSubjectId" in payload) {
    // Fail-closed: the subject must be a strict UUID (server binds it to
    // the session household) and the band must be in the closed enum —
    // no free text ever reaches the logs.
    if (!UUID_PATTERN.test(payload.offlineSubjectId)) {
      throw new Error("[client-events] rejected offline.locked: subject must be a UUID");
    }
    if (!VALID_AGE_BANDS.has(payload.ageBand)) {
      throw new Error(`[client-events] rejected unknown event: ${type}/${payload.ageBand}`);
    }
    event = {
      type,
      offlineSubjectId: payload.offlineSubjectId,
      ageBand: payload.ageBand as OfflineAgeBand,
      occurredAt: new Date().toISOString(),
    };
  } else {
    throw new Error(`[client-events] rejected unknown event: ${type}`);
  }
  const queue = [...readQueue(), event].slice(-MAX_QUEUED_EVENTS);
  writeQueue(queue);
  return event;
}

export function getQueuedClientEvents(): QueuedClientEvent[] {
  return readQueue();
}

export function clearQueuedClientEvents(): void {
  writeQueue([]);
}

/**
 * Map a queued event to the POST /client-events envelope (contract T0.4:
 * `{ eventType, payload }` with the allowlisted dimensions per type).
 */
function toClientEventBody(event: QueuedClientEvent):
  | {
      eventType: "mic.error";
      payload: { reason: MicErrorReason; capability: "on" | "off" };
    }
  | {
      eventType: "offline.locked";
      payload: { offlineSubjectId: string; ageBand: OfflineAgeBand };
    } {
  if (event.type === "offline.locked") {
    return {
      eventType: "offline.locked",
      payload: {
        offlineSubjectId: event.offlineSubjectId as string,
        ageBand: event.ageBand as OfflineAgeBand,
      },
    };
  }
  return {
    eventType: "mic.error",
    payload: {
      reason: event.reason as MicErrorReason,
      capability: event.microphoneEnabled ? "on" : "off",
    },
  };
}

/**
 * Default sender: one POST per queued event through the canonical
 * same-origin transport. Throws on the first failure (queue is kept).
 */
export async function sendQueuedClientEvents(events: QueuedClientEvent[]): Promise<void> {
  for (const event of events) {
    await apiFetch<unknown>(CLIENT_EVENTS_PATH, {
      method: "POST",
      body: JSON.stringify(toClientEventBody(event)),
    });
  }
}

/**
 * Flush the queue through `sender` (default: POST /client-events via the
 * same-origin proxy). Without queued events this is a no-op and never
 * touches the network. Clears only after every send resolves (at-least-once);
 * any failure keeps the queue durable for the next authenticated cycle.
 *
 * FIX-F1 concurrency: a single in-flight promise (mutex) coalesces
 * concurrent flushes into one sender call, and on success removes ONLY the
 * confirmed snapshot prefix — events appended while the sender was pending
 * stay queued instead of being wiped by `writeQueue([])`.
 */
let inFlightFlush: Promise<QueuedClientEvent[]> | null = null;

export function flushQueuedClientEvents(
  sender: (events: QueuedClientEvent[]) => Promise<void> = sendQueuedClientEvents,
): Promise<QueuedClientEvent[]> {
  if (inFlightFlush) return inFlightFlush;
  inFlightFlush = flushSnapshot(sender);
  return inFlightFlush.finally(() => {
    inFlightFlush = null;
  });
}

async function flushSnapshot(
  sender: (events: QueuedClientEvent[]) => Promise<void>,
): Promise<QueuedClientEvent[]> {
  const snapshot = readQueue();
  if (snapshot.length === 0) return [];
  await sender(snapshot);
  // Remove exactly the confirmed snapshot, preserving events appended
  // during the send (one occurrence per snapshot entry, in order).
  const pending = snapshot.map((event) => JSON.stringify(event));
  const remaining = readQueue().filter((event) => {
    const key = JSON.stringify(event);
    const index = pending.indexOf(key);
    if (index === -1) return true;
    pending.splice(index, 1);
    return false;
  });
  writeQueue(remaining);
  return [...snapshot];
}
