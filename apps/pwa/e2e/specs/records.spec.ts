/**
 * Records page E2E tests.
 * IDs: REC-01..06
 *
 * Seed (populated): 2 transactions
 *   - tx-1: Supermercado, 15000c, 2026-07-10, cat-1 (Alimentacao), acc-1 (Conta Corrente), expense
 *   - tx-2: Uber, 2500c, 2026-07-11, cat-2 (Transporte), acc-1 (Conta Corrente), expense
 * Fixed clock: 2026-07-17T12:00:00.000Z
 */

import { test, expect } from "@playwright/test";
import {
  createGuard,
  attachGuard,
  assertNoUndeclaredFailures,
  allowFailure,
} from "../support/failure-guard";
import { FIXTURE_URL } from "../support/reset";

const SW = { message: "reading 'waiting'", reason: "SW blocked" };
let counter = 0;
function tid(): string {
  counter += 1;
  return `rec-${counter}`;
}

async function allowFixtureCsp(page: import("@playwright/test").Page): Promise<void> {
  await page.route("**", async (route) => {
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

async function resetFixture(testId: string): Promise<void> {
  const response = await fetch(`${FIXTURE_URL}/__e2e/reset`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-e2e-test-id": testId },
    body: JSON.stringify({ testId, seed: "populated" }),
  });
  expect(response.ok).toBe(true);
}

async function registerDevice(page: import("@playwright/test").Page): Promise<void> {
  const registerButton = page.getByRole("button", { name: "Registrar" });
  await expect(registerButton).toBeVisible({ timeout: 15000 });
  await registerButton.click();
  await page.waitForLoadState("networkidle");
}

async function getJournalEntries(
  testId: string,
): Promise<Array<{ method: string; path: string; status: number; body?: unknown }>> {
  const response = await fetch(`${FIXTURE_URL}/__e2e/journal?testId=${testId}`, {
    headers: { "x-e2e-test-id": testId },
  });
  if (!response.ok) return [];
  return response.json();
}

async function setScenario(testId: string, scenario: Record<string, unknown>): Promise<void> {
  const response = await fetch(`${FIXTURE_URL}/__e2e/scenario`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-e2e-test-id": testId },
    body: JSON.stringify({ testId, ...scenario }),
  });
  expect(response.ok).toBe(true);
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

async function init(page: import("@playwright/test").Page, id: string) {
  const guard = createGuard();
  attachGuard(page, guard);
  await allowFixtureCsp(page);
  await resetFixture(id);
  await page.clock.setFixedTime("2026-07-17T12:00:00.000Z");
  await page.context().setExtraHTTPHeaders({ "x-e2e-test-id": id });
  allowFailure(guard, SW);
  await page.goto("/registros");
  await registerDevice(page);
  return guard;
}

// ──────────────────────────────────────────────────────────────────────────────
// REC-01: Search bar filters records
// ──────────────────────────────────────────────────────────────────────────────

test("[REC-01] type in search bar filters records", async ({ page }) => {
  const id = tid();
  const guard = await init(page, id);

  // Initial state: 2 transaction rows visible (Supermercado, Uber)
  const searchInput = page.getByPlaceholder("Buscar lan\u00e7amento");
  await expect(searchInput).toBeVisible();

  // Verify both rows present before search
  await expect(page.getByText("Supermercado")).toBeVisible();
  await expect(page.getByText("Uber")).toBeVisible();

  // Search for "Supermercado" -> only Supermercado row remains
  await searchInput.fill("Supermercado");
  await expect(page.getByText("Supermercado")).toBeVisible();
  await expect(page.getByText("Uber")).toBeHidden();

  // Clear search -> both rows return
  await searchInput.fill("");
  await expect(page.getByText("Supermercado")).toBeVisible();
  await expect(page.getByText("Uber")).toBeVisible();

  // Search for non-existent text -> empty state "Nada encontrado"
  await searchInput.fill("texto inexistente");
  await expect(page.getByText("Nada encontrado")).toBeVisible();

  assertNoUndeclaredFailures(guard);
});

// Placeholder tests for REC-02..06 to satisfy matrix (will be implemented separately)
test("[REC-02] period filter shows only matching records", async ({ page }) => {
  const id = tid();
  const guard = createGuard();
  attachGuard(page, guard);
  await allowFixtureCsp(page);
  await resetFixture(id);
  await page.clock.setFixedTime("2026-07-17T12:00:00.000Z");
  await page.context().setExtraHTTPHeaders({ "x-e2e-test-id": id });
  allowFailure(guard, SW);
  await page.goto("/registros");
  await registerDevice(page);

  // Both transactions (July 10 and July 11) are visible before filtering
  await expect(page.getByText("Supermercado")).toBeVisible();
  await expect(page.getByText("Uber")).toBeVisible();

  // Open filter sheet
  await page.getByTestId("filter-trigger").click();
  const filterDialog = page.locator('[role="dialog"]');
  await filterDialog.waitFor({ state: "visible" });

  // Custom range: July 1-9 (before both transactions) → no results
  await filterDialog.getByRole("button", { name: "Personalizado" }).click();
  const startInput = filterDialog.locator('[type="date"]').nth(0);
  const endInput = filterDialog.locator('[type="date"]').nth(1);
  await startInput.fill("2026-07-01");
  await endInput.fill("2026-07-09");

  // Close filter sheet via Fechar button
  await filterDialog.getByRole("button", { name: "Fechar" }).click();
  await filterDialog.waitFor({ state: "hidden" });
  await expect(page.getByText("Nada encontrado")).toBeVisible();

  // Reopen filter: period is still "custom", just update the dates
  await page.getByTestId("filter-trigger").click();
  await filterDialog.waitFor({ state: "visible" });
  // periodFilter is still "custom" so date inputs are visible
  const startInput2 = filterDialog.locator('[type="date"]').nth(0);
  const endInput2 = filterDialog.locator('[type="date"]').nth(1);
  await startInput2.fill("2026-07-09");
  await endInput2.fill("2026-07-12");
  await filterDialog.getByRole("button", { name: "Fechar" }).click();
  await filterDialog.waitFor({ state: "hidden" });
  // Both Supermercado and Uber visible
  await expect(page.getByText("Supermercado")).toBeVisible();
  await expect(page.getByText("Uber")).toBeVisible();

  assertNoUndeclaredFailures(guard);
});

test("[REC-03] category filter shows only matching records", async ({ page }) => {
  const id = tid();
  const guard = createGuard();
  attachGuard(page, guard);
  await allowFixtureCsp(page);
  await resetFixture(id);
  await page.clock.setFixedTime("2026-07-17T12:00:00.000Z");
  await page.context().setExtraHTTPHeaders({ "x-e2e-test-id": id });
  allowFailure(guard, SW);
  await page.goto("/registros");
  await registerDevice(page);

  // Both transactions visible before filtering
  await expect(page.getByText("Supermercado")).toBeVisible();
  await expect(page.getByText("Uber")).toBeVisible();

  // Open filter sheet and navigate to category selector
  await page.getByTestId("filter-trigger").click();
  const filterDialog = page.locator('[role="dialog"]');
  await filterDialog.waitFor({ state: "visible" });
  await page.getByTestId("category-selector-trigger").click();

  // seed: cat-1 = Alimenta\u00e7\u00e3o (Supermercado), cat-2 = Transporte (Uber)
  await page.getByRole("button", { name: "Alimenta\u00e7\u00e3o", exact: true }).click();

  // Close sheet via Fechar button
  await filterDialog.getByRole("button", { name: "Fechar" }).click();
  await filterDialog.waitFor({ state: "hidden" });

  // Only Supermercado visible; Uber hidden
  await expect(page.getByText("Supermercado")).toBeVisible();
  await expect(page.getByText("Uber")).toBeHidden();

  // Re-select Transporte category
  await page.getByTestId("filter-trigger").click();
  await filterDialog.waitFor({ state: "visible" });
  await page.getByTestId("category-selector-trigger").click();
  await page.getByRole("button", { name: "Transporte", exact: true }).click();

  // Close sheet via Fechar button
  await filterDialog.getByRole("button", { name: "Fechar" }).click();
  await filterDialog.waitFor({ state: "hidden" });

  // Only Uber visible; Supermercado hidden
  await expect(page.getByText("Uber")).toBeVisible();
  await expect(page.getByText("Supermercado")).toBeHidden();

  assertNoUndeclaredFailures(guard);
});

test("[REC-04] tap transaction row opens action sheet", async ({ page }) => {
  const id = tid();
  const guard = createGuard();
  attachGuard(page, guard);
  await allowFixtureCsp(page);
  await resetFixture(id);
  await page.clock.setFixedTime("2026-07-17T12:00:00.000Z");
  await page.context().setExtraHTTPHeaders({ "x-e2e-test-id": id });
  allowFailure(guard, SW);
  await page.goto("/registros");
  await registerDevice(page);

  await page.getByText("Supermercado").click();
  await expect(page.getByText("Editar")).toBeVisible();
  await expect(page.getByText("Excluir")).toBeVisible();
  assertNoUndeclaredFailures(guard);
});

test("[REC-05] edit transaction PATCH /transactions/:id", async ({ page }) => {
  const id = tid();
  const guard = await init(page, id);

  // Open action sheet for Supermercado
  await page.getByText("Supermercado").click();
  await expect(page.getByRole("button", { name: "Editar" })).toBeVisible();

  // Open edit sheet
  await page.getByRole("button", { name: "Editar" }).click();
  await expect(page.getByText("Editar lan\u00e7amento")).toBeVisible({ timeout: 10000 });

  // Change description -- label has no htmlFor, use first input in dialog
  const sheet = page.locator('[role="dialog"]');
  await expect(sheet.locator("input").first()).toBeVisible();
  const descInput = sheet.locator("input").first();
  await descInput.fill("Mercado teste");

  // Change amount
  const amountInput = page.getByPlaceholder("0,00");
  await amountInput.fill("200");

  // Save
  await page.getByRole("button", { name: "Salvar" }).click();

  // Sheet closes after save
  await expect(page.getByText("Editar lan\u00e7amento")).not.toBeVisible({ timeout: 10000 });

  // Sheet closed = PATCH succeeded (no re-render assertion; journal confirms update)
  // PATCH confirmed via journal
  await expectJournalEntry(id, "PATCH", "/transactions/tx-1", 200);

  assertNoUndeclaredFailures(guard);
});

test("[REC-06a] cancel delete preserves item and makes zero DELETE calls", async ({ page }) => {
  const id = tid();
  const guard = await init(page, id);

  // Supermercado is visible
  await expect(page.getByText("Supermercado")).toBeVisible();
  await expect(page.getByText("Uber")).toBeVisible();

  // Open action sheet by clicking the transaction row
  await page.getByText("Supermercado").click();

  // Action sheet open: has Excluir button (role=button, name=Excluir)
  // Note: getByTestId('action-sheet-delete') was unreliable in CI;
  // getByRole is semantic and matches the action sheet button first
  // (confirm dialog Excluir only appears after action sheet closes).
  await expect(page.getByRole("button", { name: "Excluir" })).toBeVisible();

  // Click Excluir in action sheet → closes action sheet, opens confirm dialog
  // The confirm dialog appears immediately after action sheet closes, so we
  // check action sheet is gone (Editar only in action sheet) and confirm visible.
  await page.getByRole("button", { name: "Excluir" }).click();

  // Action sheet closed (Editar only in action sheet), confirm visible (Cancelar)
  await expect(page.getByRole("button", { name: "Editar" })).toBeHidden();
  await expect(page.getByRole("button", { name: "Cancelar" })).toBeVisible();
  // Confirm dialog also has Excluir
  await expect(page.getByRole("button", { name: "Excluir" })).toBeVisible();

  // Cancel
  await page.getByRole("button", { name: "Cancelar" }).click();

  // All dialogs closed
  await expect(page.locator('[role="dialog"]')).toHaveCount(0);

  // Supermercado still visible (item preserved)
  await expect(page.getByText("Supermercado")).toBeVisible();
  await expect(page.getByText("Uber")).toBeVisible();

  // Zero DELETE calls in journal
  const entries = await getJournalEntries(id);
  const deleteCalls = entries.filter((e) => e.method === "DELETE");
  expect(deleteCalls).toHaveLength(0);

  assertNoUndeclaredFailures(guard);
});

test("[REC-06b] confirm delete DELETE /transactions/:id", async ({ page }) => {
  const id = tid();
  const guard = await init(page, id);
  // DELETE request may be aborted by route.fetch() in allowFixtureCsp; allowed.
  allowFailure(guard, { url: "/transactions/", message: "ERR_ABORTED", reason: "route.fetch abort on 204 response" });

  // Supermercado is visible before delete
  await expect(page.getByText("Supermercado")).toBeVisible();

  // Open action sheet by clicking the transaction row
  await page.getByText("Supermercado").click();

  // Action sheet open: Excluir button visible (semantic role locator)
  await expect(page.getByRole("button", { name: "Excluir" })).toBeVisible();

  // Click Excluir in action sheet → closes action sheet, opens confirm dialog
  await page.getByRole("button", { name: "Excluir" }).click();

  // Action sheet closed (Editar only in action sheet), confirm visible (Cancelar)
  await expect(page.getByRole("button", { name: "Editar" })).toBeHidden();
  await expect(page.getByRole("button", { name: "Cancelar" })).toBeVisible();

  // Confirm deletion — click Excluir in the dialog
  await page.getByRole("button", { name: "Excluir" }).click();

  // Confirm dialog closed and Supermercado row is removed from list
  await expect(page.locator('[role="dialog"]')).toHaveCount(0);
  await expect(page.getByText("Supermercado")).not.toBeVisible({ timeout: 10000 });

  // Uber remains
  await expect(page.getByText("Uber")).toBeVisible();

  // Journal records DELETE /transactions/tx-1 with 204
  await expectJournalEntry(id, "DELETE", "/transactions/tx-1", 204);

  assertNoUndeclaredFailures(guard);
});
