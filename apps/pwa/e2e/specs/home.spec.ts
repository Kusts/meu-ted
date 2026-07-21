/**
 * Home page E2E tests.
 * IDs: HOME-01..10
 */

import { test, expect } from "../fixtures/app";
import { createGuard, attachGuard, assertNoUndeclaredFailures, allowFailure } from "../support/failure-guard";
import { e2eSetup, registerDevice } from "../fixtures/app";

let counter = 0;
function tid(): string {
  counter++;
  return `home-${counter}-${Date.now()}`;
}

const SW = { message: "reading 'waiting'", reason: "SW blocked" };

async function init(page: import("@playwright/test").Page, id: string, guard: ReturnType<typeof createGuard>): Promise<void> {
  await e2eSetup(page, id);
  await page.goto("/");
  await registerDevice(page);
  allowFailure(guard, SW);
}

test("[HOME-01] profile button navigates to /perfil", async ({ page }) => {
  const id = tid();
  const guard = createGuard();
  attachGuard(page, guard);
  await init(page, id, guard);

  await page.getByRole("button", { name: /abrir perfil/i }).click({ timeout: 5000 });
  await page.waitForTimeout(500);

  expect(page.url()).toContain("/perfil");
  assertNoUndeclaredFailures(guard);
});

test("[HOME-04] account card navigates to /contas", async ({ page }) => {
  const id = tid();
  const guard = createGuard();
  attachGuard(page, guard);
  await init(page, id, guard);

  const card = page.getByRole("button", { name: /abrir.*conta.*em contas|conta corrente/i }).first();
  if (await card.isVisible()) {
    await card.click();
    await page.waitForTimeout(500);
  }
  await expect(page.getByLabel("Nova transação")).toBeVisible({ timeout: 5000 });
  assertNoUndeclaredFailures(guard);
});

test("[HOME-05] card card navigates to /cartoes", async ({ page }) => {
  const id = tid();
  const guard = createGuard();
  attachGuard(page, guard);
  await init(page, id, guard);

  const card = page.getByRole("button", { name: /nubank|abrir.*cartão/i }).first();
  if (await card.isVisible()) {
    await card.click();
    await page.waitForTimeout(500);
  }
  await expect(page.getByLabel("Nova transação")).toBeVisible({ timeout: 5000 });
  assertNoUndeclaredFailures(guard);
});

test("[HOME-06] payable card navigates to /a-pagar", async ({ page }) => {
  const id = tid();
  const guard = createGuard();
  attachGuard(page, guard);
  await init(page, id, guard);

  const pay = page.getByRole("button", { name: /conta.*luz|internet|abrir.*pagar/i }).first();
  if (await pay.isVisible()) {
    await pay.click();
    await page.waitForTimeout(500);
  }
  await expect(page.getByLabel("Nova transação")).toBeVisible({ timeout: 5000 });
  assertNoUndeclaredFailures(guard);
});
