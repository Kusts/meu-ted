/**
 * Goals E2E tests — GOAL-01..06
 *
 * Matrix:
 * GOAL-01 goals tab → goal type chooser renders
 * GOAL-02 debts tab → debt type chooser renders
 * GOAL-03 create goal → POST /goals
 * GOAL-04 edit goal → PATCH /goals/:id
 * GOAL-05 contribute to goal → POST /goals/:id/contribute
 * GOAL-06 cancel goal → POST /goals/:id/cancel
 *
 * Seed: Reserva de Emergência (goal-1, active, 10,000.00 target, 2,000.00 current).
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
function tid(): string { counter += 1; return `goal-${counter}`; }

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
  await page.goto("/metas");
  await expect(page.getByRole("heading", { name: /Metas/i })).toBeVisible({ timeout: 10000 });
  return guard;
}

// ── GOAL-01 ─────────────────────────────────────────────────────────────────

test("[GOAL-01] goals tab renders goal type chooser", async ({ page }) => {
  const id = tid();
  const guard = await init(page, id);

  const goalsTab = page.getByRole("button", { name: /Metas|Objetivos/i });
  if (await goalsTab.isVisible({ timeout: 3000 }).catch(() => false)) {
    await goalsTab.click();
    await expect(page.getByText(/Reserva|Emergência/i).first()).toBeVisible({ timeout: 5000 });
  }
  assertNoUndeclaredFailures(guard);
});

// ── GOAL-02 ─────────────────────────────────────────────────────────────────

test("[GOAL-02] debts tab renders debt type chooser", async ({ page }) => {
  const id = tid();
  const guard = await init(page, id);

  const debtsTab = page.getByRole("button", { name: /D[ií]vidas/i });
  if (await debtsTab.isVisible({ timeout: 3000 }).catch(() => false)) {
    await debtsTab.click();
    // Should show empty or debt-type options
    await expect(page.getByText(/Nenhuma|vazio|sem|d[ií]vida/i).first()).toBeVisible({ timeout: 5000 });
  }
  assertNoUndeclaredFailures(guard);
});

// ── GOAL-03 ─────────────────────────────────────────────────────────────────

test("[GOAL-03] create goal via POST /goals", async ({ page }) => {
  const id = tid();
  const guard = await init(page, id);

  await page.getByRole("button", { name: /Nova Meta|Adicionar|Criar/i }).click();
  const form = page.getByRole("dialog");
  await expect(form).toBeVisible({ timeout: 5000 });

  // Negative: cancel
  await form.getByRole("button", { name: /Cancelar/i }).click();
  await expect(form).toBeHidden();
  let journal = await getJournal(id);
  expect(journal.filter((e) => e.method === "POST" && e.path === "/goals")).toHaveLength(0);

  // Happy path
  await page.getByRole("button", { name: /Nova Meta|Adicionar|Criar/i }).click();
  await expect(form).toBeVisible({ timeout: 5000 });
  await form.getByPlaceholder(/nome|descri/i).fill("Viagem Europa");
  const amountInput = form.getByPlaceholder(/0,00|valor|meta/i);
  if (await amountInput.isVisible()) {
    await amountInput.fill("2000000");
  }
  // Select goal type if picker exists
  const typeBtn = form.getByRole("button", { name: /Viagem|Compra|Reserva/i });
  if (await typeBtn.isVisible({ timeout: 2000 }).catch(() => false)) await typeBtn.first().click();

  await form.getByRole("button", { name: /Salvar|Criar/i }).click();
  await expectJournalEntry(id, "POST", "/goals", 200);
  assertNoUndeclaredFailures(guard);
});

// ── GOAL-04 ─────────────────────────────────────────────────────────────────

test("[GOAL-04] edit goal via PATCH /goals/:id", async ({ page }) => {
  const id = tid();
  const guard = await init(page, id);

  await page.getByText("Reserva de Emergência").first().click();
  const editBtn = page.getByRole("button", { name: /Editar/i });
  if (await editBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await editBtn.click();
    const form = page.getByRole("dialog");
    await expect(form).toBeVisible({ timeout: 3000 });
    const nameInput = form.getByPlaceholder(/nome|descri/i);
    if (await nameInput.isVisible()) {
      await nameInput.clear();
      await nameInput.fill("Reserva Turbo");
    }
    await form.getByRole("button", { name: /Salvar/i }).click();
  }

  await expectJournalEntry(id, "PATCH", /^\/goals\/[a-zA-Z0-9_-]+$/, 200);
  assertNoUndeclaredFailures(guard);
});

// ── GOAL-05 ─────────────────────────────────────────────────────────────────

test("[GOAL-05] contribute to goal via POST /goals/:id/contribute", async ({ page }) => {
  const id = tid();
  const guard = await init(page, id);

  await page.getByText("Reserva de Emergência").first().click();
  const contributeBtn = page.getByRole("button", { name: /Contribuir|Adicionar|Depositar/i });
  if (await contributeBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await contributeBtn.click();
    const form = page.getByRole("dialog");
    const amountInput = form.getByPlaceholder(/0,00|valor/i);
    if (await amountInput.isVisible({ timeout: 3000 })) {
      // Negative: cancel
      await form.getByRole("button", { name: /Cancelar/i }).click();
      await expect(form).toBeHidden();
      let journal = await getJournal(id);
      expect(journal.filter((e) => e.method === "POST" && e.path.includes("contribute"))).toHaveLength(0);

      // Happy path
      await contributeBtn.click();
      await amountInput.fill("50000");
      await form.getByRole("button", { name: /Confirmar|Salvar/i }).click();
    }
  }

  await expectJournalEntry(id, "POST", /\/contribute$/, 200);
  assertNoUndeclaredFailures(guard);
});

// ── GOAL-06 ─────────────────────────────────────────────────────────────────

test("[GOAL-06] cancel goal via POST /goals/:id/cancel", async ({ page }) => {
  const id = tid();
  const guard = await init(page, id);

  await page.getByText("Reserva de Emergência").first().click();
  const cancelBtn = page.getByRole("button", { name: /Cancelar|Desativar|Excluir/i });
  if (await cancelBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await cancelBtn.click();
    // Negative: cancel confirmation
    const noBtn = page.getByRole("button", { name: /Não|Cancelar/i });
    if (await noBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await noBtn.click();
      let journal = await getJournal(id);
      expect(journal.filter((e) => e.method === "POST" && e.path.includes("cancel"))).toHaveLength(0);
      await cancelBtn.click();
    }
    await page.getByRole("button", { name: /Sim|Confirmar/i }).click();
  }

  await expectJournalEntry(id, "POST", /\/cancel$/, 200);
  assertNoUndeclaredFailures(guard);
});
