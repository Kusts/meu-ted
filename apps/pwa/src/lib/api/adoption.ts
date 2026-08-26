import { apiFetch, isApiConfigured } from "./client";

export type AdoptionEventType =
  | "notification_delivered"
  | "notification_opened"
  | "chat_used"
  | "capture_started"
  | "capture_completed";

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

export async function recordAdoptionEvent(
  eventType: AdoptionEventType,
  input: { flowId?: string; occurredAt?: string } = {},
): Promise<void> {
  if (!isApiConfigured()) return;
  try {
    await apiFetch("/observability/adoption-events", {
      method: "POST",
      body: JSON.stringify({ eventType, ...input }),
    });
  } catch {
    // Telemetry must never block the primary user action.
  }
}

export async function fetchAdoptionFunnel(
  input: {
    from?: string;
    to?: string;
  } = {},
): Promise<AdoptionFunnel> {
  const params = new URLSearchParams();
  if (input.from) params.set("from", input.from);
  if (input.to) params.set("to", input.to);
  return apiFetch<AdoptionFunnel>(
    `/observability/adoption-funnel${params.size ? `?${params.toString()}` : ""}`,
  );
}
