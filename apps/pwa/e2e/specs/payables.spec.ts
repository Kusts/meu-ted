/**
 * Payables page E2E tests — PAY-01..06
 *
 * Matrix:
 * PAY-01 create payable → POST /payables
 * PAY-02 select status filter → list filtered
 * PAY-03 mark payable as paid → POST /payables/:id/pay
 * PAY-04 undo payment → POST /payables/:id/unpay
 * PAY-05 cancel payable → POST /payables/:id/cancel
 * PAY-06 save payable edit → PATCH /payables/:id
 *
 * Seed: Conta de Luz (12000c, 2026-07-20), Internet (8900c, 2026-07-15)
 * Fixed clock: 2026-07-17 → Internet overdue, Luz pending
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
  return `pay-${counter}`;
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
  await page.goto("/a-pagar");
  await registerDevice(page);
  return guard;
}

// ── PAY-01 ─────────────────────────────────────────────────────────────────

test("[PAY-01] create payable via POST /payables", async ({ page }) => {
  const id = tid();
  const guard = await init(page, id);

  // Seed payables visible
  await expect(page.getByText("Conta de Luz")).toBeVisible();

  // Tap Nova button
  await page.getByRole("button", { name: "Nova" }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();

  const dialog = page.getByRole("dialog");
  // Description input has placeholder "Ex: Aluguel, Netflix..."
  await dialog.getByPlaceholder("Ex: Aluguel, Netflix...").fill("Água");
  // Amount input has placeholder "0,00"
  await dialog.getByPlaceholder("0,00").fill("7500");
  // Date input is type="date"
  await dialog.locator('input[type="date"]').fill("2026-08-05");

  // Save via "Salvar conta" button
  await dialog.getByRole("button", { name: "Salvar conta" }).click();

  await expectJournalEntry(id, "POST", "/payables", 200);
  await expect(page.getByText("Água")).toBeVisible({ timeout: 10000 });

  assertNoUndeclaredFailures(guard);
});

// ── PAY-02 ─────────────────────────────────────────────────────────────────

test("[PAY-02] select status filter filters the list", async ({ page }) => {
  const id = tid();
  const guard = await init(page, id);

  // Both payables visible
  await expect(page.getByText("Conta de Luz")).toBeVisible();
  await expect(page.getByText("Internet")).toBeVisible();

  // Status filter chips: "Todas", "Vencidas", "Próximas", "Pagas"
  // Click "Pagas" → should only show paid items (none seeded as paid → empty)
  await page.getByRole("button", { name: "Pagas" }).click();

  // No paid items seeded → empty state
  await expect(page.getByText("Nada encontrado")).toBeVisible({ timeout: 10000 });

  // Click "Todas" → both payables visible again
  await page.getByRole("button", { name: "Todas" }).click();
  await expect(page.getByText("Conta de Luz")).toBeVisible();

  assertNoUndeclaredFailures(guard);
});

// ── PAY-03 ─────────────────────────────────────────────────────────────────

test("[PAY-03] mark payable as paid via POST /payables/:id/pay", async ({ page }) => {
  const id = tid();
  const guard = await init(page, id);

  await expect(page.getByText("Conta de Luz")).toBeVisible();
  // Click on Conta de Luz row → opens detail sheet
  await page.getByText("Conta de Luz").click();
  await expect(page.getByRole("dialog")).toBeVisible();

  // In detail sheet, click "Marcar como paga"
  const payBtn = page.getByRole("button", { name: "Marcar como paga" });
  await expect(payBtn).toBeVisible();
  await payBtn.click();

  await expectJournalEntry(id, "POST", "/payables/pay-1/pay", 200);

  assertNoUndeclaredFailures(guard);
});

// ── PAY-04 ─────────────────────────────────────────────────────────────────

test("[PAY-04] undo payment via POST /payables/:id/unpay", async ({ page }) => {
  const id = tid();
  const guard = await init(page, id);

  // First mark Conta de Luz as paid
  await page.getByText("Conta de Luz").click();
  await page.getByRole("button", { name: "Marcar como paga" }).click();
  // Wait for dialog to close (button disappears)
  await expect(page.getByRole("button", { name: "Marcar como paga" })).not.toBeVisible({ timeout: 5000 });

  // Re-open Conta de Luz (now marked paid) → should show "Desfazer pagamento" button
  await page.getByText("Conta de Luz").click();
  await expect(page.getByRole("dialog")).toBeVisible();

  const unpayBtn = page.getByRole("button", { name: "Desfazer pagamento" });
  await expect(unpayBtn).toBeVisible();
  await unpayBtn.click();

  // Confirm dialog for undo
  const confirmBtn = page.getByRole("button", { name: "Sim, desfazer pagamento" });
  await expect(confirmBtn).toBeVisible();
  await confirmBtn.click();

  await expectJournalEntry(id, "POST", "/payables/pay-1/unpay", 200);

  assertNoUndeclaredFailures(guard);
});

// ── PAY-05 ─────────────────────────────────────────────────────────────────

test("[PAY-05] cancel payable via POST /payables/:id/cancel", async ({ page }) => {
  const id = tid();
  const guard = await init(page, id);

  await expect(page.getByText("Internet")).toBeVisible();
  // Click on Internet row → opens detail sheet
  await page.getByText("Internet").click();
  await expect(page.getByRole("dialog")).toBeVisible();

  // Click "Cancelar conta" button in detail sheet
  const cancelBtn = page.getByRole("button", { name: "Cancelar conta" });
  await expect(cancelBtn).toBeVisible();
  await cancelBtn.click();

  // Confirm dialog opens with "Cancelar conta" as confirm label... actually it's "Sim, cancelar conta"
  const confirmBtn = page.getByRole("button", { name: "Sim, cancelar conta" });
  await expect(confirmBtn).toBeVisible({ timeout: 5000 });
  await confirmBtn.click();

  await expectJournalEntry(id, "POST", "/payables/pay-2/cancel", 200);

  assertNoUndeclaredFailures(guard);
});

// ── PAY-06 ─────────────────────────────────────────────────────────────────

test("[PAY-06] save payable edit via PATCH /payables/:id", async ({ page }) => {
  const id = tid();
  const guard = await init(page, id);

  await expect(page.getByText("Conta de Luz")).toBeVisible();
  // Click on Conta de Luz → opens detail sheet
  await page.getByText("Conta de Luz").click();
  await expect(page.getByRole("dialog")).toBeVisible();

  // Detail sheet has edit fields directly — the first input is "Descrição"
  const dialog = page.getByRole("dialog");
  const descInput = dialog.locator("input").first();
  await descInput.fill("Luz Editada");

  // Save changes via "Salvar alterações" button
  await dialog.getByRole("button", { name: "Salvar alterações" }).click();

  await expectJournalEntry(id, "PATCH", "/payables/pay-1", 200);

  assertNoUndeclaredFailures(guard);
});
