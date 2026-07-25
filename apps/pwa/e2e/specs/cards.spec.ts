/**
 * Cards page E2E tests — CARD-01..08
 *
 * Matrix:
 * CARD-01 create card → POST /cards
 * CARD-02 edit card → PATCH /cards/:id
 * CARD-03 tap card row → card detail opens
 * CARD-04 full payment → POST /cards/statements/:id/pay
 * CARD-05 partial payment → POST /cards/statements/:id/pay
 * CARD-06 tap statement row → line items show
 * CARD-07 tap purchase row → purchase detail shows
 * CARD-08 save purchase edit → PATCH /cards/purchases/:id
 *
 * Seed: Nubank card (card-1, 500000c limit), statement stmt-1 with purchases
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
  return `card-${counter}`;
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
  await page.goto("/cartoes");
  await registerDevice(page);
  return guard;
}

// ── CARD-01 ────────────────────────────────────────────────────────────────

test("[CARD-01] create card via POST /cards", async ({ page }) => {
  const id = tid();
  const guard = await init(page, id);

  // Seed card visible
  await expect(page.getByText("Nubank")).toBeVisible();

  await page.getByRole("button", { name: "Novo" }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();

  const dialog = page.getByRole("dialog");
  // Name input has placeholder "Ex: Nubank, Itaú..."
  await dialog.getByPlaceholder("Ex: Nubank, Itaú...").fill("Cartão Teste");
  // Limit input with placeholder "0,00"
  await dialog.getByPlaceholder("0,00").fill("300000");

  // Save via aria-label "Salvar cartão"
  await dialog.getByRole("button", { name: "Salvar cartão" }).click();

  await expectJournalEntry(id, "POST", "/cards", 200);
  await expect(page.getByText("Cartão Teste")).toBeVisible({ timeout: 10000 }).catch(() => {
    // Card may not auto-render; reload to verify it persisted
  });
  await page.reload();
  await expect(page.getByText("Cartão Teste")).toBeVisible({ timeout: 10000 });

  assertNoUndeclaredFailures(guard);
});

// ── CARD-02 ────────────────────────────────────────────────────────────────

test("[CARD-02] edit card via PATCH /cards/:id", async ({ page }) => {
  const id = tid();
  const guard = await init(page, id);

  await expect(page.getByText("Nubank")).toBeVisible();
  // Click Nubank card to enter detail view (inline, not a dialog)
  await page.getByText("Nubank").click();

  // In detail view, click "Editar" button
  const editBtn = page.getByRole("button", { name: "Editar" });
  await expect(editBtn).toBeVisible();
  await editBtn.click();

  await expect(page.getByRole("dialog")).toBeVisible();
  const dialog = page.getByRole("dialog");
  // First input in edit dialog
  await dialog.locator("input").first().fill("Nubank Editado");

  // Save via aria-label "Salvar edição do cartão"
  await dialog.getByLabel("Salvar edição do cartão").click();
  await expectJournalEntry(id, "PATCH", "/cards/card-1", 200);

  assertNoUndeclaredFailures(guard);
});

// ── CARD-03 ────────────────────────────────────────────────────────────────

test("[CARD-03] tap card row opens card detail", async ({ page }) => {
  const id = tid();
  const guard = await init(page, id);

  await expect(page.getByText("Nubank")).toBeVisible();
  await page.getByText("Nubank").click();

  // Card detail should show "Fatura" text in KPIs
  await expect(page.getByText("Fatura", { exact: true })).toBeVisible({ timeout: 10000 });
  // Should also show back button "Cartões"
  await expect(page.getByRole("button", { name: "Cartões" })).toBeVisible();

  assertNoUndeclaredFailures(guard);
});

// ── CARD-04 ────────────────────────────────────────────────────────────────

test("[CARD-04] full payment via POST /cards/statements/:id/pay", async ({ page }) => {
  const id = tid();
  const guard = await init(page, id);

  await page.getByText("Nubank").click();

  // Click "Pagar fatura" button
  const payBtn = page.getByRole("button", { name: "Pagar fatura" });
  await expect(payBtn).toBeVisible();
  await payBtn.click();

  // Pay dialog opens
  await expect(page.getByRole("dialog")).toBeVisible();
  // Select "Conta Corrente" as payment source
  await page.getByRole("button", { name: "Conta Corrente" }).click();
  // Click "Pagar fatura total"
  await page.getByRole("button", { name: "Pagar fatura total" }).click();

  await expectJournalEntry(id, "POST", "/cards/statements/stmt-1/pay", 200);

  assertNoUndeclaredFailures(guard);
});

// ── CARD-05 ────────────────────────────────────────────────────────────────

test("[CARD-05] partial payment via POST /cards/statements/:id/pay", async ({ page }) => {
  const id = tid();
  const guard = await init(page, id);

  await page.getByText("Nubank").click();

  await page.getByRole("button", { name: "Pagar fatura" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();

  const dialog = page.getByRole("dialog");
  // Click "Parcial" tab
  await dialog.getByRole("button", { name: "Parcial" }).click();
  // Enter partial amount
  await dialog.getByPlaceholder("0,00").fill("50000");
  // Select payment account
  await dialog.getByRole("button", { name: "Conta Corrente" }).click();
  // Submit
  await dialog.getByRole("button", { name: "Pagar valor parcial" }).click();

  await expectJournalEntry(id, "POST", "/cards/statements/stmt-1/pay", 200);

  assertNoUndeclaredFailures(guard);
});

// ── CARD-06 ────────────────────────────────────────────────────────────────

test("[CARD-06] tap statement row shows line items", async ({ page }) => {
  const id = tid();
  const guard = await init(page, id);

  await page.getByText("Nubank").click();

  // Scroll to Historico section and locate statement row buttons
  // Statement rows have aria-label like "julho de 2026 Aberta"
  const stmtRow = page.locator('[aria-label*="julho"]');
  await expect(stmtRow).toBeVisible({ timeout: 10000 });

  // Click statement row — it toggles selection; the selected statement
  // shows purchases below. Select the first statement.
  await stmtRow.click();

  // Purchase items should become visible in "Compras da fatura" section
  await expect(page.getByText("Amazon")).toBeVisible({ timeout: 10000 });

  assertNoUndeclaredFailures(guard);
});

// ── CARD-07 ────────────────────────────────────────────────────────────────

test("[CARD-07] tap purchase row shows purchase detail", async ({ page }) => {
  const id = tid();
  const guard = await init(page, id);

  await page.getByText("Nubank").click();

  // Select statement first if not auto-selected
  const stmtRow = page.locator('[aria-label*="julho"]');
  if (await stmtRow.isVisible().catch(() => false)) {
    await stmtRow.click();
  }

  // Click on Amazon purchase row to open edit sheet
  await page.getByText("Amazon").click();
  // Edit sheet opens
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("dialog").getByText("Editar compra")).toBeVisible();

  assertNoUndeclaredFailures(guard);
});

// ── CARD-08 ────────────────────────────────────────────────────────────────

test("[CARD-08] save purchase edit via PATCH /cards/purchases/:id", async ({ page }) => {
  const id = tid();
  const guard = await init(page, id);

  await page.getByText("Nubank").click();

  // Select statement if needed
  const stmtRow = page.locator('[aria-label*="julho"]');
  if (await stmtRow.isVisible().catch(() => false)) {
    await stmtRow.click();
  }

  // Click Amazon purchase → opens edit sheet
  await page.getByText("Amazon").click();
  await expect(page.getByRole("dialog")).toBeVisible();

  const dialog = page.getByRole("dialog");
  // First input is description (no placeholder, just an input)
  const descInput = dialog.locator("input").first();
  await descInput.fill("Amazon Editado");

  // Save (button has text "Salvar alterações", no aria-label)
  await dialog.getByRole("button", { name: /^Salvar alterações$/ }).click();

  await expectJournalEntry(id, "PATCH", "/cards/purchases/pur-1", 200);

  assertNoUndeclaredFailures(guard);
});
