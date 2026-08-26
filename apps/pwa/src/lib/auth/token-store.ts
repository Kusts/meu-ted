const PREFIX = "pi-finance:";

function getStorage(): Storage | null {
  if (typeof window !== "undefined" && window.localStorage) return window.localStorage;
  if (typeof globalThis !== "undefined" && globalThis.localStorage) return globalThis.localStorage;
  return null;
}

export function getToken(): string | null {
  try {
    return getStorage()?.getItem(`${PREFIX}token`) ?? null;
  } catch {
    return null;
  }
}
export function setToken(token: string): void {
  try {
    getStorage()?.setItem(`${PREFIX}token`, token);
  } catch {
    /* noop */
  }
}
export function clearToken(): void {
  try {
    getStorage()?.removeItem(`${PREFIX}token`);
  } catch {
    /* noop */
  }
}
