/**
 * Bounded sampled logging budget for POST /api/csp-report (V4 T2.7/T0.4.8).
 *
 * Split from route.ts on purpose: Next.js route modules may only export
 * HTTP method handlers + segment config, so the test-only budget reset
 * lives here instead of on the route.
 */

/** Bounded logging budget: at most N violation logs per rolling minute. */
export const CSP_REPORT_LOG_BUDGET_PER_MINUTE = 10;

let windowStartMs = Date.now();
let loggedInWindow = 0;

export function shouldLogCspViolation(nowMs: number): boolean {
  if (nowMs - windowStartMs >= 60_000) {
    windowStartMs = nowMs;
    loggedInWindow = 0;
  }
  if (loggedInWindow >= CSP_REPORT_LOG_BUDGET_PER_MINUTE) return false;
  loggedInWindow += 1;
  return true;
}

/** Test-only reset for a deterministic sampling budget in unit tests. */
export function __resetCspReportBudgetForTests(): void {
  windowStartMs = Date.now();
  loggedInWindow = 0;
}
