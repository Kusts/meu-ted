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

export type ClientEventType = "mic.error";

export interface QueuedClientEvent {
  type: ClientEventType;
  reason: MicErrorReason;
  /** Value of the microphone capability flag when the error happened. */
  microphoneEnabled: boolean;
  occurredAt: string;
}

export const CLIENT_EVENTS_STORAGE_KEY = "pi-finance:client-events";

/** Canonical API path (same-origin proxy) — never an absolute URL. */
export const CLIENT_EVENTS_PATH = "/client-events";

const MAX_QUEUED_EVENTS = 100;

const VALID_REASONS: ReadonlySet<string> = new Set(["denied", "notfound", "busy"]);

function readQueue(): QueuedClientEvent[] {
  try {
    if (typeof localStorage === "undefined") return [];
    const raw = localStorage.getItem(CLIENT_EVENTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is QueuedClientEvent =>
        typeof entry === "object" &&
        entry !== null &&
        (entry as { type?: unknown }).type === "mic.error" &&
        VALID_REASONS.has(String((entry as { reason?: unknown }).reason)),
    );
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
  type: ClientEventType,
  payload: { reason: string; microphoneEnabled: boolean },
): QueuedClientEvent {
  if (type !== "mic.error" || !VALID_REASONS.has(payload.reason)) {
    throw new Error(`[client-events] rejected unknown event: ${type}/${payload.reason}`);
  }
  const event: QueuedClientEvent = {
    type,
    reason: payload.reason as MicErrorReason,
    microphoneEnabled: payload.microphoneEnabled,
    occurredAt: new Date().toISOString(),
  };
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
 * `{ eventType, payload }` with the allowlisted `mic.error` dimensions).
 */
function toClientEventBody(event: QueuedClientEvent): {
  eventType: "mic.error";
  payload: { reason: MicErrorReason; capability: "on" | "off" };
} {
  return {
    eventType: "mic.error",
    payload: {
      reason: event.reason,
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
 */
export async function flushQueuedClientEvents(
  sender: (events: QueuedClientEvent[]) => Promise<void> = sendQueuedClientEvents,
): Promise<QueuedClientEvent[]> {
  const queue = readQueue();
  if (queue.length === 0) return [];
  await sender(queue);
  writeQueue([]);
  return [...queue];
}
