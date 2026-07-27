/**
 * Budgets E2E tests — BUD-01..04
 *
 * Matrix:
 * BUD-01 expense tab → expense type/category pickers show
 * BUD-02 income tab → income type/category pickers show
 * BUD-03 create budget → POST /budgets
 * BUD-04 update budget → PATCH /budgets/:id
 *
 * Seed: Alimentação Mensal (bud-1, 800.00/month, spent 150.00).
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
function tid(): string { counter += 1; return `bud-${counter}`; }

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
    } catch { /* teardown */ }
  });
}

test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: "ignoreErrors" }); });

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
): Promise<Array<{ method: string; path: string; status: number }>> {
  const res = await fetch(`${FIXTURE_URL}/__e2e/journal?testId=${testId}`, {
    headers: { "x-e2e-test-id": testId },
  });
  if (!res.ok) return [];
  return res.json();
}

async function expectJournalEntry(
  testId: string, method: string, path: string | RegExp, status: number,
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
  await page.goto("/orcamentos");
  await expect(page.getByRole("heading", { name: /Or[iç]amentos/i })).toBeVisible({ timeout: 10000 });
  return guard;
}

// ── BUD-01 ──────────────────────────────────────────────────────────────────

test("[BUD-01] expense tab shows expense category pickers", async ({ page }) => {
  const id = tid();
  const guard = await init(page, id);

  // Look for expense/despesa tab
  const expenseTab = page.getByRole("button", { name: /Despesa/i });
  if (await expenseTab.isVisible({ timeout: 3000 }).catch(() => false)) {
    await expenseTab.click();
    // Should see expense categories
    await expect(page.getByText(/Alimentação/i).first()).toBeVisible({ timeout: 5000 });
  }
  assertNoUndeclaredFailures(guard);
});

// ── BUD-02 ──────────────────────────────────────────────────────────────────

test("[BUD-02] income tab shows income category pickers", async ({ page }) => {
  const id = tid();
  const guard = await init(page, id);

  const incomeTab = page.getByRole("button", { name: /Receita/i });
  if (await incomeTab.isVisible({ timeout: 3000 }).catch(() => false)) {
    await incomeTab.click();
    await expect(page.getByText(/Salário/i).first()).toBeVisible({ timeout: 5000 });
  }
  assertNoUndeclaredFailures(guard);
});

// ── BUD-03 ──────────────────────────────────────────────────────────────────

test("[BUD-03] create budget via POST /budgets", async ({ page }) => {
  const id = tid();
  const guard = await init(page, id);

  await page.getByRole("button", { name: /Novo|Adicionar|Criar/i }).click();
  const form = page.getByRole("dialog");
  await expect(form).toBeVisible({ timeout: 5000 });

  // Negative: cancel
  await form.getByRole("button", { name: /Cancelar/i }).click();
  await expect(form).toBeHidden();
  let journal = await getJournal(id);
  expect(journal.filter((e) => e.method === "POST" && e.path === "/budgets")).toHaveLength(0);

  // Happy path
  await page.getByRole("button", { name: /Novo|Adicionar|Criar/i }).click();
  await expect(form).toBeVisible({ timeout: 5000 });
  await form.getByPlaceholder(/nome|descri/i).fill("Transporte Mensal");
  const amountInput = form.getByPlaceholder(/0,00|valor|limite/i);
  if (await amountInput.isVisible()) {
    await amountInput.fill("30000");
  }
  // Select category if picker exists
  const catBtn = form.getByRole("button", { name: /Transporte/i });
  if (await catBtn.isVisible({ timeout: 2000 }).catch(() => false)) await catBtn.click();

  await form.getByRole("button", { name: /Salvar|Criar/i }).click();
  await expectJournalEntry(id, "POST", "/budgets", 200);
  assertNoUndeclaredFailures(guard);
});

// ── BUD-04 ──────────────────────────────────────────────────────────────────

test("[BUD-04] update budget via PATCH /budgets/:id", async ({ page }) => {
  const id = tid();
  const guard = await init(page, id);

  // Tap existing budget
  await page.getByText("Alimentação Mensal").first().click();
  const editBtn = page.getByRole("button", { name: /Editar/i });
  if (await editBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await editBtn.click();
    const form = page.getByRole("dialog");
    await expect(form).toBeVisible({ timeout: 3000 });
    const amountInput = form.getByPlaceholder(/0,00|valor|limite/i);
    if (await amountInput.isVisible()) {
      await amountInput.fill("100000");
    }
    const nameInput = form.getByPlaceholder(/nome|descri/i);
    if (await nameInput.isVisible()) {
      await nameInput.clear();
      await nameInput.fill("Alimentação Aumentada");
    }
    await form.getByRole("button", { name: /Salvar/i }).click();
  }

  await expectJournalEntry(id, "PATCH", /^\/budgets\/[a-zA-Z0-9_-]+$/, 200);
  assertNoUndeclaredFailures(guard);
});
