import { clearToken } from "./auth/token-store";

export function resetLocalSession(): void {
  clearToken();
  // Legacy PIN cleanup for old clients that still have these keys
  try {
    localStorage.removeItem("pi-finance:pin-hash");
    localStorage.removeItem("pi-finance:pin-salt");
    localStorage.removeItem("pi-finance:pin");
  } catch {
    /* noop */
  }
}
