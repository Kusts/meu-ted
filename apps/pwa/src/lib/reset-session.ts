import { clearSensitiveSession } from "@/lib/session";

/**
 * Clear all local session data on logout / 401 expiry.
 * Calls the canonical clearSensitiveSession with all flags on,
 * plus legacy PIN cleanup for old clients.
 * All operations are synchronous — cleanup completes before caller resumes.
 */
export function resetLocalSession(): void {
  clearSensitiveSession({
    clearToken: true,
    clearV1Snapshot: true,
    clearProfile: true,
  });

  // Legacy PIN cleanup for old clients that still have these keys
  try {
    localStorage.removeItem("pi-finance:pin-hash");
    localStorage.removeItem("pi-finance:pin-salt");
    localStorage.removeItem("pi-finance:pin");
  } catch {
    /* noop */
  }
}
