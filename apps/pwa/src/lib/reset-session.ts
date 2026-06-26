import { clearToken } from "./auth/token-store";
import { clearPin } from "./auth/pin-store";

export function resetLocalSession(): void {
  clearToken();
  clearPin();
}
