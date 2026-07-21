/**
 * Profile page E2E tests — PROF-01..06
 *
 * Matrix:
 * PROF-01 save profile name → PATCH /profile
 * PROF-02 save avatar → PATCH /profile
 * PROF-03 save greeting → PATCH /profile
 * PROF-04 tap notification opens item / target
 * PROF-05 dismiss notification → state update
 * PROF-06 logout clears token/snapshot → register screen
 *
 * Fixed clock 2026-07-17 → Internet payable overdue → notification items exist.
 */

import { test, expect } from "@playwright/test";
import {
  allowFailure,
  assertNoUndeclaredFailures,
  attachGuard,
  createGuard,
} from "../support/failure-guard";
import { FIXTURE_URL } from "../support/reset";

const FIXED_CLOCK = "2026-07-17T12:00:00.000Z";
const TOKEN_KEY = "pi-finance:token";
const SW = { message: "reading 'waiting'", reason: "SW blocked" };

let counter = 0;
function tid(): string {
  counter += 1;
  return `prof-${counter}`;
}

async function allowFixtureCsp(page: import("@playwright/test").Page): Promise<void> {
  await page.route("**/*", async (route) => {
    try {
      const response = await route.fetch();
      const headers = { ...response.headers() };
      const csp = headers["content-security-policy"];
      if (csp) {
        headers["content-security-policy"] = csp
          .replace(/connect-src\s+([^;]+)/, "connect-src http://127.0.0.1:4010 $1")
          .replace(/script-src\s+([^;]+)/, "script-src 'unsafe-eval' $1");
      }
      await route.fulfill({ response, headers });
    } catch {
      // teardown race
    }
  });
}

test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: "ignoreErrors" });
});

async function resetFixture(testId: string, seed = "populated"): Promise<void> {
  const res = await fetch(`${FIXTURE_URL}/__e2e/reset`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-e2e-test-id": testId },
    body: JSON.stringify({ testId, seed }),
  });
  if (!res.ok) throw new Error(`Fixture reset failed: ${res.status}`);
}

async function getJournal(
  testId: string,
): Promise<Array<{ method: string; path: string; status: number; body?: unknown }>> {
  const res = await fetch(`${FIXTURE_URL}/__e2e/journal?testId=${testId}`, {
    headers: { "x-e2e-test-id": testId },
  });
  if (!res.ok) return [];
  return res.json();
}

async function expectJournalPatchProfile(
  testId: string,
  partial: Record<string, unknown>,
): Promise<void> {
  await expect
    .poll(async () => {
      const entries = await getJournal(testId);
      return entries.filter(
        (e) => e.method === "PATCH" && e.path === "/profile" && e.status === 200,
      );
    })
    .not.toHaveLength(0);

  const entries = await getJournal(testId);
  const patch = entries
    .filter((e) => e.method === "PATCH" && e.path === "/profile" && e.status === 200)
    .at(-1);
  expect(patch).toBeDefined();
  expect(patch!.body).toMatchObject(partial);
}

async function registerDevice(page: import("@playwright/test").Page): Promise<void> {
  const registerButton = page.getByRole("button", { name: "Registrar" });
  await expect(registerButton).toBeVisible({ timeout: 15000 });
  await registerButton.click();
  await expect(page.getByLabel("Nova transação")).toBeVisible({ timeout: 15000 });
}

async function init(page: import("@playwright/test").Page, id: string) {
  const guard = createGuard();
  attachGuard(page, guard);
  await allowFixtureCsp(page);
  await resetFixture(id);
  await page.clock.setFixedTime(FIXED_CLOCK);
  await page.context().setExtraHTTPHeaders({ "x-e2e-test-id": id });
  allowFailure(guard, SW);
  await page.addInitScript(() => {
    try {
      localStorage.removeItem("pi-finance:notifications-dismissed");
    } catch {
      /* noop */
    }
  });
  await page.goto("/perfil");
  await registerDevice(page);
  await expect(page.getByRole("heading", { name: "Perfil" })).toBeVisible({
    timeout: 10000,
  });
  return guard;
}

async function openEditSheet(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "Editar perfil" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "Editar perfil" })).toBeVisible();
  return dialog;
}

/** Type into a controlled React textbox and assert the value stuck. */
async function setTextbox(
  locator: import("@playwright/test").Locator,
  value: string,
) {
  await locator.click();
  await locator.fill("");
  await locator.pressSequentially(value, { delay: 15 });
  await expect(locator).toHaveValue(value);
}

// ── PROF-01 ────────────────────────────────────────────────────────────────

test("[PROF-01] save profile name → PATCH /profile", async ({ page }) => {
  const id = tid();
  const guard = await init(page, id);

  const dialog = await openEditSheet(page);
  // Name is the first textbox in the edit sheet
  const nameInput = dialog.getByRole("textbox").first();
  await setTextbox(nameInput, "Marina E2E");
  await dialog.getByRole("button", { name: "Salvar alterações" }).click();

  await expect(dialog).toBeHidden();
  await expectJournalPatchProfile(id, { name: "Marina E2E" });
  await expect(page.getByText("Marina E2E")).toBeVisible();
  assertNoUndeclaredFailures(guard);
});

// ── PROF-02 ────────────────────────────────────────────────────────────────

test("[PROF-02] save avatar → PATCH /profile", async ({ page }) => {
  const id = tid();
  const guard = await init(page, id);

  const dialog = await openEditSheet(page);
  await dialog.getByRole("button", { name: "Cor #EC7000" }).click();
  // Force a dirty name touch so save is unambiguously intentional
  await expect(dialog.getByRole("button", { name: "Cor #EC7000" })).toBeVisible();
  await dialog.getByRole("button", { name: "Salvar alterações" }).click();

  await expect(dialog).toBeHidden();
  await expectJournalPatchProfile(id, { avatarColor: "#EC7000" });
  assertNoUndeclaredFailures(guard);
});

// ── PROF-03 ────────────────────────────────────────────────────────────────

test("[PROF-03] save greeting → PATCH /profile", async ({ page }) => {
  const id = tid();
  const guard = await init(page, id);

  const dialog = await openEditSheet(page);
  await dialog.getByRole("button", { name: "Detalhada" }).click();
  await expect(dialog.getByRole("button", { name: "Detalhada" })).toBeVisible();
  await dialog.getByRole("button", { name: "Salvar alterações" }).click();

  await expect(dialog).toBeHidden();
  await expectJournalPatchProfile(id, { greetingStyle: "verbose" });
  assertNoUndeclaredFailures(guard);
});

// ── PROF-04 ────────────────────────────────────────────────────────────────

test("[PROF-04] tap notification opens item / target state", async ({ page }) => {
  const id = tid();
  const guard = await init(page, id);

  await page.getByRole("button", { name: "Notificações" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Notificações")).toBeVisible();

  const item = dialog.getByTestId("notification-item").first();
  await expect(item).toBeVisible();
  await item.getByRole("button", { name: "Abrir" }).click();

  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(/\/a-pagar/);
  assertNoUndeclaredFailures(guard);
});

// ── PROF-05 ────────────────────────────────────────────────────────────────

test("[PROF-05] dismiss notification → state update", async ({ page }) => {
  const id = tid();
  const guard = await init(page, id);

  await page.getByRole("button", { name: "Notificações" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  const items = dialog.getByTestId("notification-item");
  const before = await items.count();
  expect(before).toBeGreaterThan(0);

  await items.first().getByRole("button", { name: "Dispensar" }).click();
  await expect(items).toHaveCount(before - 1);

  // Dismissed set persisted
  const dismissed = await page.evaluate(() =>
    localStorage.getItem("pi-finance:notifications-dismissed"),
  );
  expect(dismissed).toBeTruthy();
  expect(JSON.parse(dismissed as string).length).toBeGreaterThan(0);
  assertNoUndeclaredFailures(guard);
});

// ── PROF-06 ────────────────────────────────────────────────────────────────

test("[PROF-06] logout clears token/snapshot → register screen", async ({ page }) => {
  const id = tid();
  const guard = await init(page, id);

  // Token present while authenticated
  const tokenBefore = await page.evaluate((k) => localStorage.getItem(k), TOKEN_KEY);
  expect(tokenBefore).toBeTruthy();

  await page.getByRole("button", { name: "Sair da conta" }).click();

  // Back to register gate
  await expect(page.getByRole("button", { name: "Registrar" })).toBeVisible({
    timeout: 15000,
  });
  await expect(page).toHaveURL(/\/$/);

  const tokenAfter = await page.evaluate((k) => localStorage.getItem(k), TOKEN_KEY);
  expect(tokenAfter).toBeNull();
  assertNoUndeclaredFailures(guard);
});
