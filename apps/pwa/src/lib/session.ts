/**
 * Clear sensitive session data on logout / 401 expiry.
 *
 * Each store (token, v1 localStorage snapshot, profile, in-memory state,
 * v2 IndexedDB snapshot) is attempted independently. A failure in one store
 * never aborts the others, every attempt is awaited, and no rejection can
 * escape (logout must never throw or leave an unhandled rejection).
 *
 * Granular flags allow selective cleanup:
 * - `clearToken` removes the auth token from localStorage.
 * - `clearV1Snapshot` removes the v1 offline snapshot AND v2 (IndexedDB) snapshot.
 * - `clearProfile` removes the persisted profile.
 * - `clearMemory` is a callback to reset in-memory state (set state to initial values).
 *
 * Idempotent: calling multiple times is safe.
 * Does NOT touch Cache Storage (static app-shell caches intentionally remain).
 */

import { clearToken, clearSessionToken } from "@/lib/auth/token-store";
import { deleteV2Snapshot } from "@/lib/state/snapshot-db";
import { clearActiveWorkspaceId } from "@/lib/api/client";
import { clearAgentConnectionTokenCache } from "@/lib/api/agent-auth";

const SNAPSHOT_KEY = "pi-finance:snapshot:v1";
const PROFILE_KEY = "pi-finance:profile";

export interface ClearSessionOptions {
  clearToken?: boolean;
  clearV1Snapshot?: boolean;
  clearProfile?: boolean;
  /** Callback to reset in-memory state (e.g. set states to initial values). */
  clearMemory?: () => void;
}

/**
 * Clear sensitive session data.
 * Each store is attempted independently; all are awaited; no rejection escapes.
 * All flags default to `false` — opt-in per call.
 */
export async function clearSensitiveSession(
  options: ClearSessionOptions,
): Promise<void> {
  const {
    clearToken: doToken = false,
    clearV1Snapshot: doSnapshot = false,
    clearProfile: doProfile = false,
    clearMemory,
  } = options;

  // Independent tasks — each isolated so one store's failure cannot abort
  // cleanup of the others. Every task is awaited via allSettled below.
  const tasks: Promise<void>[] = [];

  if (doToken) {
    tasks.push(
      Promise.resolve().then(() => { try { clearToken(); } catch { /* noop */ } }),
    );
    tasks.push(
      Promise.resolve().then(() => { try { clearSessionToken(); } catch { /* noop */ } }),
    );
    tasks.push(
      Promise.resolve().then(() => { try { localStorage.removeItem("pi-finance:session-token"); } catch { /* noop */ } }),
    );
    tasks.push(
      Promise.resolve().then(() => { try { clearActiveWorkspaceId(); } catch { /* noop */ } }),
    );
  }
  if (doSnapshot) {
    tasks.push(
      Promise.resolve().then(() => {
        try { localStorage.removeItem(SNAPSHOT_KEY); } catch { /* noop */ }
      }),
    );
  }
  if (doProfile) {
    tasks.push(
      Promise.resolve().then(() => {
        try { localStorage.removeItem(PROFILE_KEY); } catch { /* noop */ }
      }),
    );
  }
  if (clearMemory) {
    tasks.push(
      Promise.resolve().then(() => { try { clearMemory(); } catch { /* noop */ } }),
    );
  }
  if (doSnapshot) {
    // v2 IndexedDB snapshot — independent of the v1 localStorage delete above.
    tasks.push(deleteV2Snapshot().catch(() => { /* noop */ }));
  }

  if (doToken || doSnapshot) {
    // H-05: the in-memory agent connection bearer must die with the session
    // (logout/401) and on workspace switch — otherwise the client reuses a
    // token issued for the previous user/workspace until it expires.
    tasks.push(
      Promise.resolve().then(() => { try { clearAgentConnectionTokenCache(); } catch { /* noop */ } }),
    );
  }

  // Await every attempt. allSettled guarantees no rejection escapes even if a
  // store fails, and all stores are attempted regardless of earlier failures.
  await Promise.allSettled(tasks);
}
