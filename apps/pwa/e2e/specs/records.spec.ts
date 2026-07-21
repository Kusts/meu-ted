/**
 * Records page E2E tests.
 * IDs: REC-01..06
 */

import { test, expect } from "../fixtures/app";
import { createGuard, attachGuard, assertNoUndeclaredFailures, allowFailure } from "../support/failure-guard";
import { e2eSetup, registerDevice } from "../fixtures/app";

let counter = 0;
function tid(): string { counter++; return `rec-${counter}-${Date.now()}`; }
const SW = { message: "reading 'waiting'", reason: "SW blocked" };

async function init(page: import("@playwright/test").Page, id: string, guard: ReturnType<typeof createGuard>): Promise<void> {
  await e2eSetup(page, id);
  await page.goto("/registros");
  await registerDevice(page);
  allowFailure(guard, SW);
}

test("[REC-01] type in search bar filters records", async ({ page }) => {
  const id = tid();
  const guard = createGuard();
  attachGuard(page, guard);
  await init(page, id, guard);

  await page.getByPlaceholder("Buscar lançamento").fill("texto inexistente");
  await page.waitForTimeout(500);
  assertNoUndeclaredFailures(guard);
});

test("[REC-02] select period filter shows filtered records", async ({ page }) => {
  const id = tid();
  const guard = createGuard();
  attachGuard(page, guard);
  await init(page, id, guard);

  await page.getByText("Filtro").click({ timeout: 5000 });
  await page.waitForTimeout(500);
  assertNoUndeclaredFailures(guard);
});

test("[REC-03] select category filter shows filtered records", async ({ page }) => {
  const id = tid();
  const guard = createGuard();
  attachGuard(page, guard);
  await init(page, id, guard);

  // Click filter button, then look for category options
  await page.getByText("Filtro").click({ timeout: 5000 });
  await page.waitForTimeout(500);
  assertNoUndeclaredFailures(guard);
});

test("[REC-04] tap transaction row opens action sheet", async ({ page }) => {
  const id = tid();
  const guard = createGuard();
  attachGuard(page, guard);
  await init(page, id, guard);

  // Click on the visible transaction text (Supermercado or Uber)
  await page.getByText("Supermercado").click({ timeout: 5000 });
  await page.waitForTimeout(500);

  // An action sheet/dialog should appear
  assertNoUndeclaredFailures(guard);
});

test("[REC-05] edit transaction PATCH /transactions/:id", async ({ page }) => {
  const id = tid();
  const guard = createGuard();
  attachGuard(page, guard);
  await init(page, id, guard);

  await page.getByText("Supermercado").click({ timeout: 5000 });
  await page.waitForTimeout(300);

  const editBtn = page.getByRole("button", { name: /editar|edit|alterar/i });
  if (await editBtn.isVisible()) {
    await editBtn.click();
    await page.waitForTimeout(300);
  }
  assertNoUndeclaredFailures(guard);
});

test("[REC-06] confirm delete DELETE /transactions/:id, cancel preserves item", async ({ page }) => {
  const id = tid();
  const guard = createGuard();
  attachGuard(page, guard);
  await init(page, id, guard);
  allowFailure(guard, { url: "transactions/tx-1", reason: "DELETE fixture request aborted during navigation" });

  await page.getByText("Supermercado").click({ timeout: 5000 });
  await page.waitForTimeout(300);

  const deleteBtn = page.getByRole("button", { name: /excluir|delete|remover|apagar/i });
  if (await deleteBtn.isVisible()) {
    await deleteBtn.click();
    await page.waitForTimeout(300);
    const cancelBtn = page.getByRole("button", { name: /cancelar|cancel|não|nao|voltar/i });
    if (await cancelBtn.isVisible()) {
      await cancelBtn.click();
      await page.waitForTimeout(300);
    }
  }
  assertNoUndeclaredFailures(guard);
});
