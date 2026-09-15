/**
 * T5.3 (H-14, SPEC §22) — active pending-operations reflection for the PWA.
 *
 * The browser NEVER decides what is pending (SPEC §8.3): the count/items
 * come only from the Agent's authoritative listing and are invalidated via
 * the `pi:pending-operations-changed` window event, dispatched by the TED
 * when an operation is resolved. Any failure degrades to `null` — surfaces
 * hide the indicator instead of showing an invented number.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { fetchActivePendingOperations, type ActivePendingOperation } from "@/lib/api/agent-client";

/** Window event dispatched by the TED whenever a pending operation resolves. */
export const PENDING_OPERATIONS_CHANGED_EVENT = "pi:pending-operations-changed";

/** Fire-and-forget invalidation: external surfaces refetch the authoritative listing. */
export function notifyPendingOperationsChanged(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(PENDING_OPERATIONS_CHANGED_EVENT));
  }
}

export type PendingOperationsState = Readonly<{
  /** Authoritative lean items; `null` = unavailable (error/no workspace/first load). */
  items: ActivePendingOperation[] | null;
  /** `items.length` when known, otherwise `null` — never an invented number. */
  pendingCount: number | null;
  /** True when the last fetch failed (honest error state). */
  error: boolean;
  loading: boolean;
  /** Manual refetch (retry / event invalidation). */
  refresh: () => Promise<void>;
}>;

export function usePendingOperations(workspaceId: string | null | undefined): PendingOperationsState {
  const [items, setItems] = useState<ActivePendingOperation[] | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  // Out-of-order guard: only the latest load may land (workspace switches,
  // overlapping event invalidations).
  const loadSeqRef = useRef(0);
  const observedWorkspaceIdRef = useRef<string | null | undefined>(workspaceId);

  // Workspace loss/switching must invalidate in-flight requests during the
  // commit, before a queued response can publish an older workspace's items.
  // A passive effect would leave a microtask-sized cross-workspace leak.
  useLayoutEffect(() => {
    if (observedWorkspaceIdRef.current !== workspaceId) {
      observedWorkspaceIdRef.current = workspaceId;
      loadSeqRef.current += 1;
    }
    if (!workspaceId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- commit-phase invalidation: a lost workspace must clear items/error/loading before any queued response for the previous workspace can land (no external subscription exists to drive this).
      setItems(null);
      setError(false);
      setLoading(false);
    }
  }, [workspaceId]);

  const load = useCallback(async () => {
    if (!workspaceId) {
      // The layout effect above has already invalidated any prior workspace
      // request before this passive load path runs.
      setItems(null);
      setError(false);
      setLoading(false);
      return;
    }
    const seq = ++loadSeqRef.current;
    setLoading(true);
    try {
      const next = await fetchActivePendingOperations(workspaceId);
      if (seq !== loadSeqRef.current) return;
      setItems(next);
      setError(false);
    } catch {
      if (seq !== loadSeqRef.current) return;
      // Honest degradation: unknown — never keep stale items as if fresh,
      // never invent a count.
      setItems(null);
      setError(true);
    } finally {
      if (seq === loadSeqRef.current) setLoading(false);
    }
  }, [workspaceId]);

  // Initial load + workspace switches.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial authoritative fetch: the browser never invents pending state (§8.3), so the first paint must trigger the Agent listing load; subsequent updates arrive via load() callbacks, not render.
    void load();
  }, [load]);

  // TED-driven invalidation: an approval resolved (confirm/cancel/retry/
  // succeeded) or the chat mounted — refetch the authoritative listing.
  useEffect(() => {
    if (!workspaceId) return;
    const handler = () => {
      void load();
    };
    window.addEventListener(PENDING_OPERATIONS_CHANGED_EVENT, handler);
    return () => window.removeEventListener(PENDING_OPERATIONS_CHANGED_EVENT, handler);
  }, [load, workspaceId]);

  return { items, pendingCount: items ? items.length : null, error, loading, refresh: load };
}
