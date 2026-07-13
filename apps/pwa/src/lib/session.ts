/**
 * Clear sensitive session data on logout / 401 expiry.
 *
 * Granular flags allow selective cleanup:
 * - `clearToken` removes the auth token from localStorage.
 * - `clearV1Snapshot` removes the v1 offline snapshot.
 * - `clearProfile` removes the persisted profile.
 * - `clearMemory` is a callback to reset in-memory state (set state to initial values).
 *
 * All operations are synchronous (localStorage, callbacks). No async work,
 * so cleanup completes before any subsequent UI state transition.
 * Idempotent: calling multiple times is safe.
 * Does NOT touch Cache Storage (static app-shell caches intentionally remain).
 */

import { clearToken } from "@/lib/auth/token-store";

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
 * Clear sensitive session data synchronously.
 * All flags default to `false` — opt-in per call.
 */
export function clearSensitiveSession(options: ClearSessionOptions): void {
  const {
    clearToken: doToken = false,
    clearV1Snapshot: doSnapshot = false,
    clearProfile: doProfile = false,
    clearMemory,
  } = options;

  try {
    if (doToken) {
      clearToken();
    }

    if (doSnapshot) {
      localStorage.removeItem(SNAPSHOT_KEY);
    }

    if (doProfile) {
      localStorage.removeItem(PROFILE_KEY);
    }

    if (clearMemory) {
      clearMemory();
    }
  } catch {
    // Swallow all storage errors — logout must never throw
  }
}
