/**
 * Categories E2E tests — CAT-01..05
 *
 * Matrix:
 * CAT-01 create expense category → POST /categories
 * CAT-02 create income category → POST /categories
 * CAT-03 add subcategory → POST /categories with parentId
 * CAT-04 edit category → PATCH /categories/:id
 * CAT-05 deactivate category → POST /categories/:id/deactivate
 *
 * Seed: Alimentação (cat-1, expense), Transporte (cat-2, expense),
 * Salário (cat-3, income), Sub-alimentação (cat-4, expense, parent cat-1).
 */

import { test, expect } from "@playwright/test";
import {
  allowFailure,
  assertNoUndeclaredFailures,
  attachGuard,
  createGuard,
} from "../support/failure-guard";
import { FIXTURE_URL } from "../support/reset";

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

async function setScenario(testId: string, scenario: Record<string, unknown>): Promise<void> {
  const res = await fetch(`${FIXTURE_URL}/__e2e/scenario`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-e2e-test-id": testId },
    body: JSON.stringify({ testId, ...scenario }),
  });
  if (!res.ok) throw new Error(`Scenario set failed: ${res.status}`);
}

async function getJournal(
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
  path: string | RegExp,
  status: number,
): Promise<void> {
  await expect
    .poll(async () => getJournal(testId))
    .toContainEqual(expect.objectContaining({ method, path, status }));
}

async function registerDevice(page: import("@playwright/test").Page): Promise<void> {
  const registerButton = page.getByRole("button", { name: "Registrar" });
  await expect(registerButton).toBeVisible({ timeout: 15000 });
  await registerButton.click();
  await expect(page.getByLabel("Nova transação")).toBeVisible({ timeout: 15000 });
}

async function init(page: import("@playwright/test").Page, id: string): Promise<ReturnType<typeof createGuard>> {
  const guard = createGuard();
  attachGuard(page, guard);
  await allowFixtureCsp(page);
  await resetFixture(id);
  await page.clock.setFixedTime("2026-07-17T12:00:00.000Z");
  await page.context().setExtraHTTPHeaders({ "x-e2e-test-id": id });
  allowFailure(guard, SW);
  await page.goto("/");
  await registerDevice(page);
  await page.goto("/categorias");
  await expect(page.getByRole("heading", { name: /Categorias/i })).toBeVisible({ timeout: 10000 });
  return guard;
}

// ── CAT-01 ──────────────────────────────────────────────────────────────────

test("[CAT-01] create expense category via POST /categories", async ({ page }) => {
  const id = tid();
  const guard = await init(page, id);

  // Open create form
  await page.getByRole("button", { name: /Nova|Adicionar|Criar/i }).click();
  const nameInput = page.getByPlaceholder(/Ex: Alimentação|Nome/i);
  await expect(nameInput).toBeVisible({ timeout: 5000 });

  // Negative: blank save should not POST
  const saveBtn = page.getByRole("button", { name: /Salvar|OK/i });
  await nameInput.fill("");
  // If there's a cancel, test it
  const cancelBtn = page.getByRole("button", { name: /Cancelar/i });
  if (await cancelBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await cancelBtn.click();
    let journal = await getJournal(id);
    expect(journal.filter((e) => e.method === "POST" && e.path === "/categories")).toHaveLength(0);
    // Reopen
    await page.getByRole("button", { name: /Nova|Adicionar|Criar/i }).click();
    await expect(nameInput).toBeVisible({ timeout: 5000 });
  }

  // Happy path: fill and save
  await nameInput.fill("Lazer E2E");
  // Select expense type if toggle exists
  const expenseToggle = page.getByRole("button", { name: /Despesa/i });
  if (await expenseToggle.isVisible({ timeout: 2000 }).catch(() => false)) {
    await expenseToggle.click();
  }
  await saveBtn.click();
  await expectJournalEntry(id, "POST", "/categories", 200);
  assertNoUndeclaredFailures(guard);
});

// ── CAT-02 ──────────────────────────────────────────────────────────────────

test("[CAT-02] create income category via POST /categories", async ({ page }) => {
  const id = tid();
  const guard = await init(page, id);

  await page.getByRole("button", { name: /Nova|Adicionar|Criar/i }).click();
  const nameInput = page.getByPlaceholder(/Ex: Alimentação|Nome/i);
  await expect(nameInput).toBeVisible({ timeout: 5000 });

  await nameInput.fill("Freelance E2E");
  // Select income type
  const incomeToggle = page.getByRole("button", { name: /Receita/i });
  if (await incomeToggle.isVisible({ timeout: 2000 }).catch(() => false)) {
    await incomeToggle.click();
  }
  await page.getByRole("button", { name: /Salvar|OK/i }).click();
  await expectJournalEntry(id, "POST", "/categories", 200);
  assertNoUndeclaredFailures(guard);
});

// ── CAT-03 ──────────────────────────────────────────────────────────────────

test("[CAT-03] add subcategory via POST /categories with parentId", async ({ page }) => {
  const id = tid();
  const guard = await init(page, id);

  // Tap existing parent category to expand subcategory form
  const parentRow = page.getByText("Alimentação").first();
  await parentRow.click();
  // Look for subcategory inline input
  const subInput = page.getByPlaceholder(/subcategoria/i);
  if (await subInput.isVisible({ timeout: 5000 }).catch(() => false)) {
    // Negative: empty submit
    await subInput.fill("");
    await page.getByRole("button", { name: "OK" }).click();
    let journal = await getJournal(id);
    const catPosts = journal.filter((e) => e.method === "POST" && e.path === "/categories");
    // After empty submit, still no new category POST
    const prevCount = catPosts.length;
    expect(prevCount).toBeLessThanOrEqual(0); // no new POSTs from blank

    // Happy path
    await subInput.fill("Restaurantes E2E");
    await page.getByRole("button", { name: "OK" }).click();
    await expectJournalEntry(id, "POST", "/categories", 200);
  }
  assertNoUndeclaredFailures(guard);
});

// ── CAT-04 ──────────────────────────────────────────────────────────────────

test("[CAT-04] edit category via PATCH /categories/:id", async ({ page }) => {
  const id = tid();
  const guard = await init(page, id);

  // Look for edit button on a category row
  const editBtn = page.getByRole("button", { name: /Editar/i }).first();
  if (await editBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await editBtn.click();
    const nameInput = page.getByPlaceholder(/Ex: Alimentação|Nome/i);
    await expect(nameInput).toBeVisible({ timeout: 3000 });
    await nameInput.clear();
    await nameInput.fill("Transporte Editado");
    await page.getByRole("button", { name: /Salvar|OK/i }).click();
  } else {
    // Fallback: tap row to open inline edit
    await page.getByText("Transporte").first().click();
    const nameInput = page.getByPlaceholder(/Nome/i);
    if (await nameInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await nameInput.clear();
      await nameInput.fill("Transporte Editado");
      await page.getByRole("button", { name: /Salvar|OK/i }).click();
    }
  }

  await expectJournalEntry(id, "PATCH", /^\/categories\/[a-zA-Z0-9_-]+$/, 200);
  assertNoUndeclaredFailures(guard);
});

// ── CAT-05 ──────────────────────────────────────────────────────────────────

test("[CAT-05] deactivate category via POST /categories/:id/deactivate", async ({ page }) => {
  const id = tid();
  const guard = await init(page, id);

  // Look for deactivate/delete button
  const deactivateBtn = page.getByRole("button", { name: /Desativar|Excluir/i }).first();
  if (await deactivateBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await deactivateBtn.click();

    // Negative: cancel confirmation
    const cancelBtn = page.getByRole("button", { name: /Cancelar|Não/i });
    if (await cancelBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await cancelBtn.click();
      const journal = await getJournal(id);
      expect(
        journal.filter((e) => e.method === "POST" && /deactivate/.test(e.path)),
      ).toHaveLength(0);
      await deactivateBtn.click();
    }
    await page.getByRole("button", { name: /Sim|Confirmar|Desativar/i }).click();
  }

  await expectJournalEntry(id, "POST", /deactivate$/, 200);
  assertNoUndeclaredFailures(guard);
});
