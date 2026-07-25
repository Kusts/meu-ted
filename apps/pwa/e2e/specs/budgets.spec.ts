/**
 * Budgets page E2E tests — BUD-01..04
 *
 * Matrix:
 * BUD-01 tap expense tab → expense budgets show
 * BUD-02 tap income tab → income budgets show
 * BUD-03 create budget → POST /budgets
 * BUD-04 update budget → PATCH /budgets/:id
 *
 * Seed: Alimentação Mensal (budget, 80000c, cat-1)
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
  return `bud-${counter}`;
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
  await page.goto("/orcamentos");
  await registerDevice(page);
  return guard;
}

// ── BUD-01 ─────────────────────────────────────────────────────────────────

test("[BUD-01] expense tab shows expense budgets", async ({ page }) => {
  const id = tid();
  const guard = await init(page, id);

  // The page has two tabs: "Despesa" and "Receita"
  // Seed budget "Alimentação Mensal" has category cat-1 (Alimentação, expense)
  await expect(page.getByText("Alimentação Mensal")).toBeVisible();

  // Click "Despesas" tab (should be selected by default)
  const expenseTab = page.getByRole("button", { name: "Despesas" });
  await expect(expenseTab).toBeVisible();

  // Budget with expense category is visible
  await expect(page.getByText("Alimentação")).toBeVisible();

  assertNoUndeclaredFailures(guard);
});

// ── BUD-02 ─────────────────────────────────────────────────────────────────

test("[BUD-02] income tab shows income budgets", async ({ page }) => {
  const id = tid();
  const guard = await init(page, id);

  // Click "Receita" tab (button text is "Receitas (previsão)")
  await page.getByRole("button", { name: "Receitas" }).click();

  // Seed has no income budgets → income tab shows empty state
  await expect(page.getByText("Nenhum orçamento")).toBeVisible({ timeout: 10000 });

  assertNoUndeclaredFailures(guard);
});

// ── BUD-03 ─────────────────────────────────────────────────────────────────

test("[BUD-03] create budget via POST /budgets", async ({ page }) => {
  const id = tid();
  const guard = await init(page, id);

  // Click "Novo" button (header action)
  await page.getByRole("button", { name: "Novo" }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();

  // Step 1: Choose "Orçamento de despesa"
  await page.getByRole("button", { name: "Orçamento de despesa" }).click();

  // Step 2: Select category (Transporte)
  // Click category selector button
  const dialog = page.getByRole("dialog");
  await dialog.getByTestId("category-selector-trigger").click();

  // Select Transporte
  await dialog.getByRole("button", { name: "Transporte" }).click();

  // Fill amount — there's an input with R$ prefix, use placeholder "0,00"
  const amountInput = dialog.getByPlaceholder("0,00");
  await amountInput.fill("50000");

  // Save via "Salvar orçamento" button
  await dialog.getByRole("button", { name: "Salvar orçamento" }).click();

  await expectJournalEntry(id, "POST", "/budgets", 200);
  // Budget card created — wait for dialog to close (sheet closes on save)
  await expect(page.getByRole("dialog")).not.toBeVisible({ timeout: 10000 });

  assertNoUndeclaredFailures(guard);
});

// ── BUD-04 ─────────────────────────────────────────────────────────────────

test("[BUD-04] update budget via PATCH /budgets/:id", async ({ page }) => {
  const id = tid();
  const guard = await init(page, id);

  await expect(page.getByText("Alimentação Mensal")).toBeVisible();
  // Click on budget card text to open detail
  await page.getByText("Alimentação Mensal").click();

  // Detail sheet opens — click "Editar" button
  await expect(page.getByRole("dialog")).toBeVisible();
  const dialog = page.getByRole("dialog");
  const editBtn = dialog.getByRole("button", { name: "Editar" });
  await expect(editBtn).toBeVisible();
  await editBtn.click();
  // Wait for edit mode to render: the amount input becomes visible
  const amountInput = dialog.getByPlaceholder("0,00");
  await expect(amountInput).toBeVisible({ timeout: 5000 });
  await amountInput.fill("100000");

  // Save via "Salvar alterações"
  const saveBtn = dialog.getByRole("button", { name: "Salvar alterações" });
  await expect(saveBtn).toBeVisible({ timeout: 5000 });
  await expect(saveBtn).toBeEnabled();
  await saveBtn.click();

  await expectJournalEntry(id, "PATCH", "/budgets/bud-1", 200);

  assertNoUndeclaredFailures(guard);
});
