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

const SESSION_PREFIX = "pi-finance:session-token";

export function getSessionToken(): string | null {
  try {
    return getStorage()?.getItem(SESSION_PREFIX) ?? null;
  } catch {
    return null;
  }
}
export function setSessionToken(token: string): void {
  try {
    getStorage()?.setItem(SESSION_PREFIX, token);
  } catch {
    /* noop */
  }
}
export function clearSessionToken(): void {
  try {
    getStorage()?.removeItem(SESSION_PREFIX);
  } catch {
    /* noop */
  }
}
