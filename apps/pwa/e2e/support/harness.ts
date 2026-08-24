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

import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import {
  createGuard,
  attachGuard,
  allowFailure,
  type GuardState,
} from "./failure-guard";

// Reused from ./reset — do not redeclare these values here.
import { FIXED_CLOCK, E2E_TEST_ID_HEADER } from "./reset";

export { FIXED_CLOCK, E2E_TEST_ID_HEADER };

/** Failures every spec tolerates. Previously redeclared in each spec file. */
const BASELINE_ALLOWED = [
  { message: "reading 'waiting'", reason: "SW blocked" },
  { url: "/profile", reason: "fixture has no /profile" },
  { url: "/pwa-control", reason: "fixture has no /pwa-control" },
  { url: "/auth/devices/me", reason: "intermittent cross-test token" },
] as const;

/**
 * Establish an authenticated session.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * PHASE 1 AUTH SWAP HAPPENS HERE AND NOWHERE ELSE.
 * Today: device registration (button "Registrar" → POST /auth/devices/register).
 * Phase 1: invite-based user login. Rewrite this body only.
 * ─────────────────────────────────────────────────────────────────────────
 */
export async function authenticate(
  page: Page,
  /** Service-worker specs need a longer wait than the default. */
  options: { timeout?: number } = {},
): Promise<void> {
  const timeout = options.timeout ?? 15000;
  const fab = page.getByLabel("Nova transação");
  if (await fab.isVisible().catch(() => false)) return;

  const emailInput = page.getByLabel("E-mail");
  const passwordInput = page.getByLabel("Senha");
  const submitBtn = page.getByRole("button", { name: /Entrar|Registrar/i });

  if (await emailInput.isVisible({ timeout: 4000 }).catch(() => false)) {
    await emailInput.fill("test@example.com");
    await passwordInput.fill("password123");
    await submitBtn.click();
  } else if (await submitBtn.isVisible({ timeout: 4000 }).catch(() => false)) {
    await submitBtn.click();
  }

  await expect(fab).toBeVisible({ timeout });
}

/**
 * Reset the fixture store for a test id.
 *
 * `seed` is explicit for auth specs, which reset to non-populated states to
 * exercise registration and token expiry.
 */
export async function resetFixture(testId: string, seed = "populated"): Promise<void> {
  const res = await fetch(`${FIXTURE_URL}/__e2e/reset`, {
    method: "POST",
    headers: { "Content-Type": "application/json", [E2E_TEST_ID_HEADER]: testId },
    body: JSON.stringify({ testId, seed }),
  });
  if (!res.ok) throw new Error(`Fixture reset failed: ${res.status}`);
}

export type JournalEntry = {
  method: string;
  path: string;
  status: number;
  /** Request payload, when the fixture recorded one. Asserted by profile specs. */
  body?: unknown;
};

/** Read the fixture request journal for a test id. */
export async function getJournal(testId: string): Promise<JournalEntry[]> {
  const res = await fetch(`${FIXTURE_URL}/__e2e/journal?testId=${testId}`, {
    headers: { [E2E_TEST_ID_HEADER]: testId },
  });
  return res.ok ? res.json() : [];
}

/** Assert the journal eventually contains a matching request. */
export async function expectJournal(
  testId: string,
  method: string,
  path: string | RegExp,
  status: number,
): Promise<void> {
  await expect
    .poll(() => getJournal(testId), { timeout: 8000 })
    .toContainEqual(expect.objectContaining({ method, path, status }));
}

export type InitOptions = {
  /** Path to navigate to after authenticating. Defaults to "/". */
  navigateTo?: string;
  /** Extra tolerated failures on top of BASELINE_ALLOWED. */
  allow?: ReadonlyArray<{ message?: string; url?: string; reason: string }>;
  /**
   * Apply BASELINE_ALLOWED. Defaults to true.
   *
   * Set false for specs that deliberately run a stricter guard — navigation.spec
   * tolerates only the service-worker failure, and silently widening it to the
   * baseline set would keep those 25 tests green while detecting less.
   */
  baselineAllows?: boolean;
};

/** Intercept every response and widen its CSP so the fixture API is reachable. */
export async function applyCspRewrite(page: Page): Promise<void> {
  await page.route("**/*", async (route) => {
    try {
      const response = await route.fetch();
      const headers = { ...response.headers() };
      const csp = headers["content-security-policy"];
      if (csp) headers["content-security-policy"] = rewriteCspForFixture(csp);
      await route.fulfill({ response, headers });
    } catch {
      /* route already handled or page closed */
    }
  });
}

/**
 * Everything a spec needs *before* it navigates: guard, CSP rewrite, fixture
 * reset, fixed clock, test-id header, tolerated failures.
 *
 * Does NOT navigate and does NOT authenticate — the caller decides the order.
 * Specs that deep-link into a route and only then register (records REC-02..04,
 * every navigation spec) must use this instead of `initSpec`, because the order
 * `goto(route)` → `authenticate()` is exactly what those tests exercise.
 */
export async function prepareSpec(
  page: Page,
  testId: string,
  options: Pick<InitOptions, "allow" | "baselineAllows"> = {},
): Promise<GuardState> {
  const guard = createGuard();
  attachGuard(page, guard);

  await applyCspRewrite(page);
  await resetFixture(testId);
  await page.clock.setFixedTime(FIXED_CLOCK);
  await page.context().setExtraHTTPHeaders({ [E2E_TEST_ID_HEADER]: testId });

  if (options.baselineAllows !== false) {
    for (const entry of BASELINE_ALLOWED) allowFailure(guard, entry);
  }
  for (const entry of options.allow ?? []) allowFailure(guard, entry);

  return guard;
}

/**
 * Full per-test setup for the common case: prepare, land on "/", authenticate,
 * then navigate to the target route.
 *
 * Returns the guard so the spec can call assertNoUndeclaredFailures().
 */
export async function initSpec(
  page: Page,
  testId: string,
  options: InitOptions = {},
): Promise<GuardState> {
  const guard = await prepareSpec(page, testId, options);

  await page.goto("/");
  await authenticate(page);
  if (options.navigateTo && options.navigateTo !== "/") {
    await page.goto(options.navigateTo);
  }

  return guard;
}
