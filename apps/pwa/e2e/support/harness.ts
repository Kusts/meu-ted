/**
 * Single entry point for E2E test setup.
 *
 * Replaces the ~35 lines of helpers that were copy-pasted into every spec
 * (allowCsp, resetFixture, getJournal, expectJournal, registerDevice, init).
 *
 * AUTH BOUNDARY: `authenticate()` is the only place that knows how a session
 * is established. Phase 1 swaps device registration for user login by editing
 * that one function — no spec file changes.
 */

// Single source of truth for the fixture origin — reuse, do not redeclare.
// `support/reset.ts` already exports FIXTURE_URL; a second constant would drift.
import { FIXTURE_URL } from "./reset";

export { FIXTURE_URL };

/**
 * Rewrite a CSP header so the browser may reach the local fixture API
 * and evaluate the Next.js dev runtime.
 *
 * Returns the policy unchanged when neither directive is present.
 */
export function rewriteCspForFixture(csp: string): string {
  return csp
    .replace(/connect-src\s+([^;]+)/, `connect-src ${FIXTURE_URL} $1`)
    .replace(/script-src\s+([^;]+)/, "script-src 'unsafe-eval' $1");
}
