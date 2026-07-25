/**
 * Auth E2E tests — IDs AUTH-01, AUTH-02.
 *
 * AUTH-01: register device → assert POST /auth/devices/register 200 in journal,
 * token in localStorage, authenticated home (profile button visible).
 *
 * AUTH-02: inject expired token, register scenario for GET /auth/devices/me → 401,
 * assert storage cleared, register screen visible, journal contains 401.
 */

import { test, expect } from "@playwright/test";
import { createGuard, attachGuard, assertNoUndeclaredFailures, allowFailure } from "../support/failure-guard";
import { FIXTURE_URL } from "../support/reset";

const FIXED_CLOCK = "2026-07-17T12:00:00.000Z";
const TOKEN_KEY = "pi-finance:token";
let counter = 0;
function tid(): string { counter++; return `auth-${counter}`; }

async function allowFixtureCsp(page: import("@playwright/test").Page): Promise<void> {
  await page.route("**", async (route) => {
    const response = await route.fetch();
    const csp = response.headers()["content-security-policy"];
    if (csp) {
      const modified = csp
        .replace(/connect-src\s+([^;]+)/, "connect-src http://127.0.0.1:4010 $1")
        .replace(/script-src\s+([^;]+)/, "script-src 'unsafe-eval' $1");
      await route.fulfill({
        response,
        headers: { ...response.headers(), "content-security-policy": modified },
      });
    } else {
      await route.fulfill({ response });
    }
  });
}

async function resetFixture(testId: string, seed: string): Promise<void> {
  const res = await fetch(`${FIXTURE_URL}/__e2e/reset`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-e2e-test-id": testId },
    body: JSON.stringify({ testId, seed }),
  });
  if (!res.ok) throw new Error(`Fixture reset failed: ${res.status}`);
}

async function getJournal(testId: string): Promise<Array<{ method: string; path: string; status: number }>> {
  const res = await fetch(`${FIXTURE_URL}/__e2e/journal?testId=${testId}`, {
    headers: { "x-e2e-test-id": testId },
  });
  if (!res.ok) return [];
  return res.json();
}

async function addScenario(testId: string, method: string, pathname: string, status: number): Promise<void> {
  await fetch(`${FIXTURE_URL}/__e2e/scenario`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-e2e-test-id": testId },
    body: JSON.stringify({ testId, method, pathname, status, once: true }),
  });
}

// ── AUTH-01: Device registration ────────────────────────────────────────────

test("[AUTH-01] register device: POST /auth/devices/register 200, token stored, home rendered", async ({ page }) => {
  const id = tid();
  const guard = createGuard();
  attachGuard(page, guard);
  await allowFixtureCsp(page);
  await resetFixture(id, "populated");
  await page.clock.setFixedTime(FIXED_CLOCK);
  await page.context().setExtraHTTPHeaders({ "x-e2e-test-id": id });
  allowFailure(guard, { message: "reading 'waiting'", reason: "SW blocked by functional project" });

  await page.goto("/");
  await expect(page.getByRole("button", { name: "Registrar" })).toBeVisible({ timeout: 15000 });

  await page.getByRole("button", { name: "Registrar" }).click();
  await page.waitForLoadState("networkidle");

  // Journal: POST /auth/devices/register → 200
  const journal = await getJournal(id);
  const regEntry = journal.find((e) => e.method === "POST" && e.path === "/auth/devices/register");
  expect(regEntry).toBeDefined();
  expect(regEntry!.status).toBe(200);

  // Token in localStorage
  const token = await page.evaluate((key) => localStorage.getItem(key), TOKEN_KEY);
  expect(token).toBeTruthy();
  expect((token as string).length).toBeGreaterThan(0);

  // Authenticated home
  await expect(page.getByRole("button", { name: /abrir perfil/i })).toBeVisible({ timeout: 10000 });

  assertNoUndeclaredFailures(guard);
});

// ── AUTH-02: Expired token ──────────────────────────────────────────────────

test("[AUTH-02] expired token: GET /auth/devices/me 401, storage cleared, register screen", async ({ page }) => {
  const id = tid();
  const guard = createGuard();
  attachGuard(page, guard);
  await allowFixtureCsp(page);
  // Use populated seed so fixture has authRegister data for normal flow
  await resetFixture(id, "populated");
  await page.clock.setFixedTime(FIXED_CLOCK);
  await page.context().setExtraHTTPHeaders({ "x-e2e-test-id": id });
  allowFailure(guard, { status: 401, reason: "Fixture /auth/devices/me 401" });
  allowFailure(guard, { message: "401 (Unauthorized)", reason: "Fixture /auth/devices/me 401 console" });
  allowFailure(guard, { message: "reading 'waiting'", reason: "SW blocked by functional project" });

  // First load: inject bad token, register scenario for 401, reload
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  // Inject invalid token
  await page.evaluate((key) => localStorage.setItem(key, "expired-invalid-token-abc"), TOKEN_KEY);

  // Register fixture scenario: GET /auth/devices/me returns 401 (once)
  await addScenario(id, "GET", "/auth/devices/me", 401);

  // Reload — AuthGate reads bad token → calls /auth/devices/me → 401 → clears storage
  await page.reload();
  await page.waitForLoadState("networkidle");

  // Journal must have GET /auth/devices/me → 401
  const journal = await getJournal(id);
  const meEntry = journal.find((e) => e.method === "GET" && e.path === "/auth/devices/me");
  expect(meEntry).toBeDefined();
  expect(meEntry!.status).toBe(401);

  // Token must be cleared
  const tokenAfter = await page.evaluate((key) => localStorage.getItem(key), TOKEN_KEY);
  expect(tokenAfter).toBeNull();

  // Register screen must be visible
  await expect(page.getByRole("button", { name: "Registrar" })).toBeVisible({ timeout: 15000 });

  assertNoUndeclaredFailures(guard);
});
