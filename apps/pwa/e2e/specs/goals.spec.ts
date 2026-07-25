/**
 * Goals page E2E tests — GOAL-01..06
 *
 * Matrix:
 * GOAL-01 goals tab shows goal list
 * GOAL-02 debts tab renders
 * GOAL-03 create goal → POST /goals
 * GOAL-04 edit goal → PATCH /goals/:id
 * GOAL-05 contribute to goal → POST /goals/:id/contribute
 * GOAL-06 cancel goal → POST /goals/:id/cancel
 *
 * Seed: Reserva de Emergência (goal, emergency_fund, 1000000c target, 200000c current)
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
  return `goal-${counter}`;
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
  await page.goto("/metas");
  await registerDevice(page);
  return guard;
}

// ── GOAL-01 ────────────────────────────────────────────────────────────────

test("[GOAL-01] goals tab shows goal list", async ({ page }) => {
  const id = tid();
  const guard = await init(page, id);

  // Seed goal visible
  await expect(page.getByText("Reserva de Emergência", { exact: true })).toBeVisible();

  // Metas tab is active by default; the tab toggle has buttons "Metas" and "Dívidas"
  const goalsTab = page.getByRole("button", { name: "Metas" });
  await expect(goalsTab).toBeVisible();
  // Goal visible in list
  await expect(page.getByText("Reserva de Emergência", { exact: true })).toBeVisible();

  assertNoUndeclaredFailures(guard);
});

// ── GOAL-02 ────────────────────────────────────────────────────────────────

test("[GOAL-02] debts tab renders", async ({ page }) => {
  const id = tid();
  const guard = await init(page, id);

  // Click Dívidas tab
  await page.getByRole("button", { name: "Dívidas" }).click();

  // No seed debts, so empty state appears
  await expect(page.getByText("Nenhuma dívida")).toBeVisible({ timeout: 10000 });

  assertNoUndeclaredFailures(guard);
});

// ── GOAL-03 ─────────────────────────────────────────────────────────────────

test("[GOAL-03] create goal via POST /goals", async ({ page }) => {
  const id = tid();
  const guard = await init(page, id);

  // Click Nova button → opens type chooser
  await page.getByRole("button", { name: "Nova" }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();

  // Choose "Meta financeira"
  await page.getByRole("button", { name: "Meta financeira" }).click();

  // Now the create sheet is open
  await expect(page.getByRole("dialog")).toBeVisible();
  const dialog = page.getByRole("dialog");
  // Name input has placeholder "Ex: Viagem, Carro novo..."
  await dialog.getByPlaceholder("Ex: Viagem, Carro novo...").fill("Fundo de Viagem");
  // Target amount with placeholder "0,00"
  await dialog.getByPlaceholder("0,00").fill("500000");

  // Save via "Salvar meta" button
  await dialog.getByRole("button", { name: "Salvar meta" }).click();

  await expectJournalEntry(id, "POST", "/goals", 200);
  await expect(page.getByText("Fundo de Viagem")).toBeVisible({ timeout: 10000 });

  assertNoUndeclaredFailures(guard);
});

// ── GOAL-04 ─────────────────────────────────────────────────────────────────

test("[GOAL-04] edit goal via PATCH /goals/:id", async ({ page }) => {
  const id = tid();
  const guard = await init(page, id);

  await expect(page.getByText("Reserva de Emergência", { exact: true })).toBeVisible();
  // Click the goal card area (it's a clickable div)
  await page.getByText("Reserva de Emergência", { exact: true }).click();

  // Detail sheet opens
  await expect(page.getByRole("dialog")).toBeVisible();

  // Click "Editar" button inside the dialog
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Editar" }).click();
  // Wait for edit mode: name input becomes visible
  const nameInput = dialog.locator("input").first();
  await expect(nameInput).toBeVisible({ timeout: 5000 });
  await nameInput.fill("Reserva Reforçada");

  // Save button says "Salvar alterações"
  const saveBtn = dialog.getByRole("button", { name: "Salvar alterações" });
  await expect(saveBtn).toBeVisible({ timeout: 5000 });
  await expect(saveBtn).toBeEnabled();
  await saveBtn.click();

  await expectJournalEntry(id, "PATCH", "/goals/goal-1", 200);

  assertNoUndeclaredFailures(guard);
});

// ── GOAL-05 ─────────────────────────────────────────────────────────────────

test("[GOAL-05] contribute to goal via POST /goals/:id/contribute", async ({ page }) => {
  const id = tid();
  const guard = await init(page, id);

  await expect(page.getByText("Reserva de Emergência", { exact: true })).toBeVisible();

  // Click "Adicionar" button on the goal card
  await page.getByRole("button", { name: "Adicionar" }).first().click();

  await expect(page.getByRole("dialog")).toBeVisible();
  const dialog = page.getByRole("dialog");
  // Amount input with placeholder "0,00" (inside a div with R$ prefix)
  await dialog.getByPlaceholder("0,00").fill("50000");

  // Save button says "Adicionar"
  await dialog.getByRole("button", { name: "Adicionar" }).click();

  await expectJournalEntry(id, "POST", "/goals/goal-1/contribute", 200);

  assertNoUndeclaredFailures(guard);
});

// ── GOAL-06 ─────────────────────────────────────────────────────────────────

test("[GOAL-06] cancel goal via POST /goals/:id/cancel", async ({ page }) => {
  const id = tid();
  const guard = await init(page, id);

  await expect(page.getByText("Reserva de Emergência", { exact: true })).toBeVisible();

  // Click "Cancelar" button on the goal card
  await page.getByRole("button", { name: "Cancelar" }).first().click();

  // Confirm dialog opens with "Cancelar meta"
  const confirmBtn = page.getByRole("button", { name: "Cancelar meta" });
  await expect(confirmBtn).toBeVisible();
  await confirmBtn.click();

  await expectJournalEntry(id, "POST", "/goals/goal-1/cancel", 200);

  assertNoUndeclaredFailures(guard);
});
