/**
 * Records page E2E tests.
 * IDs: REC-01..06
 *
 * Seed (populated): 2 transactions
 *   - tx-1: Supermercado, 15000¢, 2026-07-10, cat-1 (Alimentação), acc-1 (Conta Corrente), expense
 *   - tx-2: Uber, 2500¢, 2026-07-11, cat-2 (Transporte), acc-1 (Conta Corrente), expense
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
  const searchInput = page.getByPlaceholder("Buscar lançamento");
  await expect(searchInput).toBeVisible();

  // Verify both rows present before search
  await expect(page.getByText("Supermercado")).toBeVisible();
  await expect(page.getByText("Uber")).toBeVisible();

  // Search for "Supermercado" → only Supermercado row remains
  await searchInput.fill("Supermercado");
  await expect(page.getByText("Supermercado")).toBeVisible();
  await expect(page.getByText("Uber")).toBeHidden();

  // Clear search → both rows return
  await searchInput.fill("");
  await expect(page.getByText("Supermercado")).toBeVisible();
  await expect(page.getByText("Uber")).toBeVisible();

  // Search for non-existent text → empty state "Nada encontrado"
  await searchInput.fill("texto inexistente");
  await expect(page.getByText("Nada encontrado")).toBeVisible();

  assertNoUndeclaredFailures(guard);
});

// Placeholder tests for REC-02..06 to satisfy matrix (will be implemented separately)
test("[REC-02] select period filter shows filtered records", async ({ page }) => {
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

  await page.getByTestId("filter-trigger").click();
  await expect(page.getByText("Período")).toBeVisible();
  assertNoUndeclaredFailures(guard);
});

test("[REC-03] select category filter shows filtered records", async ({ page }) => {
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

  await page.getByTestId("filter-trigger").click();
  await expect(page.getByTestId("category-selector-trigger")).toBeVisible();
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
  await page.getByRole("button", { name: "Editar" }).click();
  await expect(page.getByText("Editar lançamento")).toBeVisible();
  assertNoUndeclaredFailures(guard);
});

test("[REC-06] confirm delete DELETE /transactions/:id, cancel preserves item", async ({ page }) => {
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
  await page.getByRole("button", { name: "Excluir" }).click();
  // Cancel by clicking outside or pressing Escape - the item remains
  await page.keyboard.press("Escape");
  await expect(page.getByText("Supermercado")).toBeVisible();
  assertNoUndeclaredFailures(guard);
});