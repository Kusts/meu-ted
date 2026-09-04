/**
 * Live mutation assert — strict 2xx only.
 * Must NOT mask 401 (auth), 403 (forbidden), 429 (rate-limit) or 5xx as "blocked".
 * Any non-2xx is a product failure and must fail the test.
 */
export type LiveResponse = { status: number; ok: boolean; body?: unknown };

export function assertLiveSuccess(res: LiveResponse, label: string): void {
  if (!res.ok || res.status < 200 || res.status >= 300) {
    const snippet = JSON.stringify(res.body ?? {}).slice(0, 600);
    throw new Error(
      `${label} expected 2xx but got ${res.status} ok=${res.ok} body=${snippet}`
    );
  }
}

/**
 * Legacy masking helper — DEPRECATED, kept for RED test demonstration.
 */
export function isLegacyBlocked(status: number): boolean {
  return [400, 403, 409, 422].includes(status);
}

export function legacyAssertMasked(res: LiveResponse, label: string): void {
  if (!res.ok) {
    if (isLegacyBlocked(res.status)) return;
    throw new Error(`${label} failed ${res.status}`);
  }
}
