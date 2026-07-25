/**
 * Subscriptions page E2E tests — SUB-01..05
 *
 * Matrix:
 * SUB-01 subscription tab shows list
 * SUB-02 create subscription → POST /subscriptions
 * SUB-03 detail subscription → display values
 * SUB-04 edit subscription → PATCH /subscriptions/:id
 * SUB-05 cancel subscription → POST /subscriptions/:id/cancel
 *
 * Seed: Netflix (sub-1, 5590c, monthly, day 10)
 * Fixed clock: 2026-07-17T12:00:00.000Z
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
const SW = { message: "reading 'waiting'", reason: "SW blocked" };

let counter = 0;
function tid(): string {
  counter += 1;
  return `sub-${counter}`;
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
      /* teardown */
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

async function getJournalEntries(
  testId: string,
): Promise<Array<{ method: string; path: string; status: number }>> {
  const res = await fetch(`${FIXTURE_URL}/__e2e/journal?testId=${testId}`, {
    headers: { "x-e2e-test-id": testId },
  });
  if (!res.ok) return [];
  return res.json();
}

async function expectJournalEntry(
  testId: string,
  method: string,
  path: string,
  status: number,
): Promise<void> {
  await expect
    .poll(async () => getJournalEntries(testId))
    .toContainEqual(expect.objectContaining({ method, path, status }));
}

async function registerDevice(page: import("@playwright/test").Page): Promise<void> {
  const registerButton = page.getByRole("button", { name: "Registrar" });
  await expect(registerButton).toBeVisible({ timeout: 15000 });
  await registerButton.click();
  await page.waitForLoadState("networkidle");
}

async function init(page: import("@playwright/test").Page, id: string) {
  const guard = createGuard();
  attachGuard(page, guard);
  await allowFixtureCsp(page);
  await resetFixture(id);
  await page.clock.setFixedTime(FIXED_CLOCK);
  await page.context().setExtraHTTPHeaders({ "x-e2e-test-id": id });
  allowFailure(guard, SW);
  await page.goto("/assinaturas");
  await registerDevice(page);
  return guard;
}

// ── SUB-01 ─────────────────────────────────────────────────────────────────

test("[SUB-01] subscription tab shows list", async ({ page }) => {
  const id = tid();
  const guard = await init(page, id);

  // Seed subscription visible as a card/row
  await expect(page.getByText("Netflix")).toBeVisible();

  // The active tab is selected by default
  await expect(page.getByRole("button", { name: "Ativas" })).toBeVisible();

  assertNoUndeclaredFailures(guard);
});

// ── SUB-02 ─────────────────────────────────────────────────────────────────

test("[SUB-02] create subscription via POST /subscriptions", async ({ page }) => {
  const id = tid();
  const guard = await init(page, id);

  // Click "Nova" button
  await page.getByRole("button", { name: "Nova" }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();

  const dialog = page.getByRole("dialog");
  // The form has service presets (Netflix, Spotify, etc.) and a name input
  // Click Spotify preset first
  await dialog.getByRole("button", { name: "Spotify" }).click();

  // Fill amount — the amount input has placeholder "0,00"
  const amountInput = dialog.getByPlaceholder("0,00");
  await amountInput.fill("3490");

  // Fill day — day of month input has placeholder "1 a 31"
  const dayInput = dialog.getByPlaceholder("1 a 31");
  await dayInput.fill("15");

  // Save via "Salvar assinatura" button
  await dialog.getByRole("button", { name: "Salvar assinatura" }).click();

  await expectJournalEntry(id, "POST", "/subscriptions", 200);
  // Spotify should appear in the list (use first to avoid strict mode with preset button)
  await expect(page.getByText("Spotify").first()).toBeVisible({ timeout: 10000 });
  // Close any remaining dialog
  const dialog2 = page.getByRole("dialog");
  if (await dialog2.isVisible().catch(() => false)) {
    await dialog2.getByRole("button", { name: "Fechar" }).click().catch(() => {});
  }

  assertNoUndeclaredFailures(guard);
});

// ── SUB-03 ─────────────────────────────────────────────────────────────────

test("[SUB-03] detail subscription shows values", async ({ page }) => {
  const id = tid();
  const guard = await init(page, id);

  await expect(page.getByText("Netflix")).toBeVisible();

  // Click on Netflix row to open detail (the row is a button)
  const netflixRow = page.getByRole("button", { name: /Netflix/ }).first();
  await netflixRow.click();

  // Detail sheet opens with Netflix info
  await expect(page.getByRole("dialog")).toBeVisible();

  // Value shown in the detail: there should be a value display
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Netflix")).toBeVisible();

  assertNoUndeclaredFailures(guard);
});

// ── SUB-04 ─────────────────────────────────────────────────────────────────

test("[SUB-04] edit subscription via PATCH /subscriptions/:id", async ({ page }) => {
  const id = tid();
  const guard = await init(page, id);

  await expect(page.getByText("Netflix")).toBeVisible();

  // Open detail
  await page.getByRole("button", { name: /Netflix/ }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();

  // Click "Editar" button in detail sheet
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Editar" }).click();

  // Edit mode — first input is editable name
  const nameInput = dialog.locator("input").first();
  await expect(nameInput).toBeVisible({ timeout: 5000 });
  await nameInput.fill("Netflix Premium");

  // Save via "Salvar alterações"
  const saveBtn = dialog.getByRole("button", { name: "Salvar alterações" });
  await expect(saveBtn).toBeVisible({ timeout: 5000 });
  await expect(saveBtn).toBeEnabled();
  await saveBtn.click();

  await expectJournalEntry(id, "PATCH", "/subscriptions/sub-1", 200);

  assertNoUndeclaredFailures(guard);
});

// ── SUB-05 ─────────────────────────────────────────────────────────────────

test("[SUB-05] cancel subscription via POST /subscriptions/:id/cancel", async ({ page }) => {
  const id = tid();
  const guard = await init(page, id);

  await expect(page.getByText("Netflix")).toBeVisible();

  // Open detail
  await page.getByRole("button", { name: /Netflix/ }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();

  // Click "Cancelar assinatura"
  const cancelBtn = page.getByRole("button", { name: "Cancelar assinatura" });
  await expect(cancelBtn).toBeVisible();
  await cancelBtn.click();

  // Confirm dialog with "Cancelar assinatura"
  const confirmBtn = page.getByRole("button", { name: "Cancelar assinatura" });
  await expect(confirmBtn).toBeVisible();
  await confirmBtn.click();

  await expectJournalEntry(id, "POST", "/subscriptions/sub-1/cancel", 200);

  assertNoUndeclaredFailures(guard);
});
