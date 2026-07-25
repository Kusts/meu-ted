/**
 * Categories page E2E tests — CAT-01..05
 *
 * Matrix:
 * CAT-01 create expense category → POST /categories
 * CAT-02 create income category → POST /categories
 * CAT-03 add subcategory → POST /categories with parent
 * CAT-04 edit category → PATCH /categories/:id
 * CAT-05 deactivate category → POST /categories/:id/deactivate
 *
 * Seed: Alimentação (expense), Transporte (expense), Salário (income)
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
  return `cat-${counter}`;
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
  await page.goto("/categorias");
  await registerDevice(page);
  return guard;
}

// ── CAT-01 ─────────────────────────────────────────────────────────────────

test("[CAT-01] create expense category via POST /categories", async ({ page }) => {
  const id = tid();
  const guard = await init(page, id);

  // Seed categories visible
  await expect(page.getByText("Alimentação", { exact: true })).toBeVisible();
  await expect(page.getByText("Transporte", { exact: true })).toBeVisible();

  // Tap Nova button (header action)
  await page.getByRole("button", { name: "Nova" }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();

  const dialog = page.getByRole("dialog");
  // Name input has placeholder "Ex: Alimentação, Salário..."
  await dialog.getByPlaceholder("Ex: Alimentação, Salário...").fill("Lazer");

  // Save button says "Salvar categoria"
  await dialog.getByRole("button", { name: "Salvar categoria" }).click();

  await expectJournalEntry(id, "POST", "/categories", 200);
  await expect(page.getByText("Lazer")).toBeVisible({ timeout: 10000 });

  assertNoUndeclaredFailures(guard);
});

// ── CAT-02 ─────────────────────────────────────────────────────────────────

test("[CAT-02] create income category via POST /categories", async ({ page }) => {
  const id = tid();
  const guard = await init(page, id);

  await page.getByRole("button", { name: "Nova" }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();

  const dialog = page.getByRole("dialog");
  await dialog.getByPlaceholder("Ex: Alimentação, Salário...").fill("Freelance");

  // Switch to Receita tab in the form
  await dialog.getByRole("button", { name: "Receita" }).click();
  await dialog.getByRole("button", { name: "Salvar categoria" }).click();

  await expectJournalEntry(id, "POST", "/categories", 200);
  await expect(page.getByText("Freelance")).toBeVisible({ timeout: 10000 });

  assertNoUndeclaredFailures(guard);
});

// ── CAT-03 ─────────────────────────────────────────────────────────────────

test("[CAT-03] add subcategory via POST /categories with parentId", async ({ page }) => {
  const id = tid();
  const guard = await init(page, id);

  await expect(page.getByText("Alimentação", { exact: true })).toBeVisible();

  // Click "+ Sub" button next to Alimentação category row (first one)
  await page.getByRole("button", { name: "+ Sub" }).first().click();

  // Inline input appears with placeholder "Nome da subcategoria…"
  const subInput = page.getByPlaceholder("Nome da subcategoria…");
  await expect(subInput).toBeVisible();
  await subInput.fill("Restaurante");

  // Click OK button
  await page.getByRole("button", { name: "OK" }).click();

  await expectJournalEntry(id, "POST", "/categories", 200);

  assertNoUndeclaredFailures(guard);
});

// ── CAT-04 ─────────────────────────────────────────────────────────────────

test("[CAT-04] edit category via PATCH /categories/:id", async ({ page }) => {
  const id = tid();
  const guard = await init(page, id);

  await expect(page.getByText("Alimentação", { exact: true })).toBeVisible();

  // Click "Editar" button next to Alimentação row (1st Editar button in expense section)
  await page.getByRole("button", { name: "Editar" }).first().click();

  await expect(page.getByRole("dialog")).toBeVisible();
  const dialog = page.getByRole("dialog");
  const nameInput = dialog.locator("input").first();
  await nameInput.fill("Alimentação Editada");
  await dialog.getByRole("button", { name: "Salvar" }).click();
  await expectJournalEntry(id, "PATCH", "/categories/cat-1", 200);

  assertNoUndeclaredFailures(guard);
});

// ── CAT-05 ─────────────────────────────────────────────────────────────────

test("[CAT-05] deactivate category via POST /categories/:id/deactivate", async ({ page }) => {
  const id = tid();
  const guard = await init(page, id);

  await expect(page.getByText("Transporte", { exact: true })).toBeVisible();

  // Click "Desativar" button next to the Transporte row (2nd Desativar: Alimentação=0, Transporte=1)
  await page.getByRole("button", { name: "Desativar" }).nth(1).click();

  // Confirm dialog — scope to dialog to avoid row-level "Desativar" buttons
  const confirmBtn = page.getByRole("dialog").getByRole("button", { name: "Desativar" });
  await expect(confirmBtn).toBeVisible();
  await confirmBtn.click();
  await expectJournalEntry(id, "POST", "/categories/cat-2/deactivate", 200);

  assertNoUndeclaredFailures(guard);
});
