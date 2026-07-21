/**
 * Transaction sheet E2E tests.
 * IDs: TX-01..09
 */

import { test, expect } from "../fixtures/app";
import { createGuard, attachGuard, assertNoUndeclaredFailures, allowFailure } from "../support/failure-guard";
import { e2eSetup, registerDevice } from "../fixtures/app";

let counter = 0;
function tid(): string { counter++; return `tx-${counter}-${Date.now()}`; }
const SW = { message: "reading 'waiting'", reason: "SW blocked" };

async function init(page: import("@playwright/test").Page, id: string, guard: ReturnType<typeof createGuard>): Promise<void> {
  await e2eSetup(page, id);
  await page.goto("/");
  await registerDevice(page);
  allowFailure(guard, SW);
}

test("[TX-01] FAB visible on home page", async ({ page }) => {
  const id = tid();
  const guard = createGuard();
  attachGuard(page, guard);
  await init(page, id, guard);
  await expect(page.getByLabel("Nova transação")).toBeVisible({ timeout: 5000 });
  assertNoUndeclaredFailures(guard);
});

test("[TX-02] save expense POST /transactions/expense", async ({ page }) => {
  const id = tid();
  const guard = createGuard();
  attachGuard(page, guard);
  await init(page, id, guard);

  await page.getByRole("button", { name: "Despesa" }).click({ timeout: 5000 });
  await page.getByPlaceholder("Ex: Aluguel, mercado...").waitFor({ state: "visible", timeout: 5000 });

  await page.getByPlaceholder("Ex: Aluguel, mercado...").fill("Supermercado teste");
  await page.getByPlaceholder("0,00").fill("5000");
  await page.locator("[role='dialog']").getByRole("button", { name: /salvar/i }).click();
  await page.waitForTimeout(1500);

  assertNoUndeclaredFailures(guard);
});

test("[TX-03] save income POST /transactions/income", async ({ page }) => {
  const id = tid();
  const guard = createGuard();
  attachGuard(page, guard);
  await init(page, id, guard);

  await page.getByRole("button", { name: "Receita" }).click({ timeout: 5000 });
  await page.getByPlaceholder("Ex: Aluguel, mercado...").waitFor({ state: "visible", timeout: 5000 });

  await page.getByPlaceholder("Ex: Aluguel, mercado...").fill("Salário E2E");
  await page.getByPlaceholder("0,00").fill("500000");
  await page.locator("[role='dialog']").getByRole("button", { name: /salvar/i }).click();
  await page.waitForTimeout(1500);

  assertNoUndeclaredFailures(guard);
});

test("[TX-04] save transfer POST /transfers", async ({ page }) => {
  const id = tid();
  const guard = createGuard();
  attachGuard(page, guard);
  await init(page, id, guard);

  await page.getByRole("button", { name: "Transferir" }).click({ timeout: 5000 });
  await page.getByPlaceholder("Ex: Aluguel, mercado...").waitFor({ state: "visible", timeout: 5000 });

  await page.getByPlaceholder("Ex: Aluguel, mercado...").fill("PIX E2E");
  await page.getByPlaceholder("0,00").fill("25000");
  await page.locator("[role='dialog']").getByRole("button", { name: /transferir|salvar/i }).click();
  await page.waitForTimeout(1500);

  assertNoUndeclaredFailures(guard);
});

test("[TX-09] save installments POST /cards/installments", async ({ page }) => {
  const id = tid();
  const guard = createGuard();
  attachGuard(page, guard);
  await init(page, id, guard);

  await page.getByRole("button", { name: "Despesa" }).click({ timeout: 5000 });
  await page.getByPlaceholder("Ex: Aluguel, mercado...").waitFor({ state: "visible", timeout: 5000 });

  await page.getByLabel("Alternar parcelamento").click();
  await page.waitForTimeout(300);

  await page.getByPlaceholder("Ex: Aluguel, mercado...").fill("Parcelado E2E");
  await page.getByPlaceholder("0,00").fill("60000");
  await page.locator("[role='dialog']").getByRole("button", { name: /salvar/i }).click();
  await page.waitForTimeout(1500);

  assertNoUndeclaredFailures(guard);
});
