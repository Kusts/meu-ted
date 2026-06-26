const PREFIX = "pi-finance:";

export function getToken(): string | null {
  try {
    return localStorage.getItem(`${PREFIX}token`);
  } catch {
    return null;
  }
}
export function setToken(token: string): void {
  try {
    localStorage.setItem(`${PREFIX}token`, token);
  } catch {
    /* noop */
  }
}
export function clearToken(): void {
  try {
    localStorage.removeItem(`${PREFIX}token`);
  } catch {
    /* noop */
  }
}
