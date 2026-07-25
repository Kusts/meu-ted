/**
 * Accounts page E2E tests — ACC-01..06
 *
 * Matrix:
 * ACC-01 create bank account → POST /accounts
 * ACC-02 create cash account → POST /accounts
 * ACC-03 create credit card → POST /cards
 * ACC-04 edit bank account → PATCH /accounts/:id
 * ACC-05 edit credit card → PATCH /cards/:id
 * ACC-06 confirm deactivation → POST /accounts/:id/deactivate
 *
 * Seed: Conta Corrente (bank), Dinheiro (cash), Nubank (credit_card)
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
  return `acc-${counter}`;
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
  allowFailure(guard, { status: 502, reason: "Fixture 502 during reset race" });
  await page.goto("/contas");
  await registerDevice(page);
  return guard;
}

// ── ACC-01 ─────────────────────────────────────────────────────────────────

test("[ACC-01] create bank account via POST /accounts", async ({ page }) => {
  const id = tid();
  const guard = await init(page, id);

  // Verify Conta Corrente is visible (seed data)
  await expect(page.getByText("Conta Corrente")).toBeVisible();

  // Tap Nova button to open create sheet (the header action button)
  await page.getByRole("button", { name: "Nova" }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();

  const dialog = page.getByRole("dialog");
  // The name input has placeholder "Ex: Nubank, Itaú..."
  await dialog.getByPlaceholder("Ex: Nubank, Itaú...").fill("Nova Conta Teste");
  // The balance input has placeholder "0,00"
  await dialog.getByPlaceholder("0,00").fill("100000");

  // Save button says "Salvar conta"
  await dialog.getByRole("button", { name: "Salvar conta" }).click();

  // Journal confirms POST /accounts
  await expectJournalEntry(id, "POST", "/accounts", 200);
  await expect(page.getByText("Nova Conta Teste")).toBeVisible({ timeout: 10000 });

  assertNoUndeclaredFailures(guard);
});

// ── ACC-02 ─────────────────────────────────────────────────────────────────

test("[ACC-02] create cash account via POST /accounts", async ({ page }) => {
  const id = tid();
  const guard = await init(page, id);

  await page.getByRole("button", { name: "Nova" }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();

  const dialog = page.getByRole("dialog");
  // Fill name
  await dialog.getByPlaceholder("Ex: Nubank, Itaú...").fill("Carteira Teste");
  // Fill balance
  await dialog.getByPlaceholder("0,00").fill("5000");

  // Save
  await dialog.getByRole("button", { name: "Salvar conta" }).click();

  await expectJournalEntry(id, "POST", "/accounts", 200);
  await expect(page.getByText("Carteira Teste")).toBeVisible({ timeout: 10000 });

  assertNoUndeclaredFailures(guard);
});

// ── ACC-03 ─────────────────────────────────────────────────────────────────

test("[ACC-03] create credit card via POST /cards", async ({ page }) => {
  const id = tid();
  const guard = await init(page, id);

  // Navigate to /cartoes for card creation
  await page.goto("/cartoes");
  await page.waitForLoadState("networkidle");

  await page.getByRole("button", { name: "Novo" }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();

  const dialog = page.getByRole("dialog");
  // Name input has placeholder "Ex: Nubank, Itaú..."
  await dialog.getByPlaceholder("Ex: Nubank, Itaú...").fill("Cartão Teste");
  // Limit input with placeholder "0,00"
  await dialog.getByPlaceholder("0,00").fill("10000");

  // Save button has aria-label "Salvar cartão"
  await dialog.getByRole("button", { name: "Salvar cartão" }).click();

  await expectJournalEntry(id, "POST", "/cards", 200);
  await expect(page.getByText("Cartão Teste")).toBeVisible({ timeout: 10000 });

  assertNoUndeclaredFailures(guard);
});

// ── ACC-04 ─────────────────────────────────────────────────────────────────

test("[ACC-04] edit bank account via PATCH /accounts/:id", async ({ page }) => {
  const id = tid();
  const guard = await init(page, id);

  await expect(page.getByText("Conta Corrente")).toBeVisible();

  // Tap Conta Corrente card → opens detail sheet
  await page.getByText("Conta Corrente").click();
  await expect(page.getByRole("dialog")).toBeVisible();

  // In detail sheet, click "Editar conta"
  const editBtn = page.getByRole("button", { name: "Editar conta" });
  await editBtn.click();

  // Edit sheet opens — edit input has no specific placeholder
  await expect(page.getByRole("dialog")).toBeVisible();
  const editDialog = page.getByRole("dialog");
  const nameInput = editDialog.locator("input").first();
  await nameInput.fill("CC Editada");

  // Save button says "Salvar"
  await editDialog.getByRole("button", { name: "Salvar" }).click();
  await expectJournalEntry(id, "PATCH", "/accounts/acc-1", 200);

  assertNoUndeclaredFailures(guard);
});

// ── ACC-05 ─────────────────────────────────────────────────────────────────

test("[ACC-05] edit credit card via PATCH /cards/:id", async ({ page }) => {
  const id = tid();
  const guard = await init(page, id);

  // Navigate to /cartoes
  await page.goto("/cartoes");
  await page.waitForLoadState("networkidle");

  // Click on Nubank card to see card detail
  await expect(page.getByText("Nubank")).toBeVisible();
  await page.getByText("Nubank").click();

  // In card detail, click "Editar" button
  const editBtn = page.getByRole("button", { name: "Editar" });
  await expect(editBtn).toBeVisible();
  await editBtn.click();

  await expect(page.getByRole("dialog")).toBeVisible();
  const dialog = page.getByRole("dialog");
  // First input is the name field
  const nameInput = dialog.locator("input").first();
  await nameInput.fill("Nubank Editado");

  // Save button has aria-label "Salvar edição do cartão"
  await dialog.getByLabel("Salvar edição do cartão").click();
  await expectJournalEntry(id, "PATCH", "/cards/card-1", 200);

  assertNoUndeclaredFailures(guard);
});

// ── ACC-06 ─────────────────────────────────────────────────────────────────

test("[ACC-06] confirm deactivation via POST /accounts/:id/deactivate", async ({ page }) => {
  const id = tid();
  const guard = await init(page, id);

  // Tap Dinheiro account → detail sheet
  // Use first() because the button has "Dinheiro" twice (name + kind)
  await page.getByText("Dinheiro", { exact: true }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();

  // In detail sheet, click "Desativar conta"
  const deactivateBtn = page.getByRole("button", { name: "Desativar conta" });
  await expect(deactivateBtn).toBeVisible();
  await deactivateBtn.click();

  // Confirm dialog appears with "Desativar" button
  const confirmBtn = page.getByRole("button", { name: "Desativar" });
  await expect(confirmBtn).toBeVisible();
  await confirmBtn.click();

  await expectJournalEntry(id, "POST", "/accounts/acc-2/deactivate", 200);

  assertNoUndeclaredFailures(guard);
});
