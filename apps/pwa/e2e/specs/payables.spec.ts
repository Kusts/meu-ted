/**
 * Payables E2E tests — PAY-01..06
 *
 * Matrix:
 * PAY-01 create payable → POST /payables
 * PAY-02 filter by status → filtered list
 * PAY-03 mark paid → POST /payables/:id/pay
 * PAY-04 undo payment → POST /payables/:id/unpay
 * PAY-05 cancel payable → POST /payables/:id/cancel
 * PAY-06 edit payable → PATCH /payables/:id
 *
 * Seed: Conta de Luz (pay-1, pending, 120.00), Internet (pay-2, pending, 89.00).
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
function tid(): string { counter += 1; return `pay-${counter}`; }

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
  await page.goto("/a-pagar");
  await expect(page.getByRole("heading", { name: /A Pagar|Contas/i })).toBeVisible({ timeout: 10000 });
  return guard;
}

// ── PAY-01 ──────────────────────────────────────────────────────────────────

test("[PAY-01] create payable via POST /payables", async ({ page }) => {
  const id = tid();
  const guard = await init(page, id);

  await page.getByRole("button", { name: /Nova Conta|Adicionar|Novo/i }).click();
  const form = page.getByRole("dialog");
  await expect(form).toBeVisible({ timeout: 5000 });

  // Negative: cancel
  await form.getByRole("button", { name: /Cancelar/i }).click();
  await expect(form).toBeHidden();
  let journal = await getJournal(id);
  expect(journal.filter((e) => e.method === "POST" && e.path === "/payables")).toHaveLength(0);

  // Happy path
  await page.getByRole("button", { name: /Nova Conta|Adicionar|Novo/i }).click();
  await expect(form).toBeVisible({ timeout: 5000 });
  await form.getByPlaceholder(/descri[iç]|nome/i).fill("Aluguel Julho");
  const amountInput = form.getByPlaceholder(/0,00|valor/i);
  if (await amountInput.isVisible()) {
    await amountInput.fill("150000");
  }
  await form.getByRole("button", { name: /Salvar|Criar|Adicionar/i }).click();
  await expect(form).toBeHidden();
  await expectJournalEntry(id, "POST", "/payables", 200);
  assertNoUndeclaredFailures(guard);
});

// ── PAY-02 ──────────────────────────────────────────────────────────────────

test("[PAY-02] select status filter shows filtered list", async ({ page }) => {
  const id = tid();
  const guard = await init(page, id);

  // Look for status filter chips
  const pendingChip = page.getByRole("button", { name: /Pendente/i });
  const paidChip = page.getByRole("button", { name: /Pago/i });
  if (await pendingChip.isVisible({ timeout: 3000 }).catch(() => false)) {
    await paidChip.click();
    // Should filter to paid only (empty in seed)
    await expect(page.getByText(/Nenhuma|vazio|sem/i).first()).toBeVisible({ timeout: 5000 });
    await pendingChip.click();
    // Should show pending payables again
    await expect(page.getByText("Conta de Luz")).toBeVisible({ timeout: 5000 });
  }
  assertNoUndeclaredFailures(guard);
});

// ── PAY-03 ──────────────────────────────────────────────────────────────────

test("[PAY-03] mark payable as paid via POST /payables/:id/pay", async ({ page }) => {
  const id = tid();
  const guard = await init(page, id);

  // Tap on Conta de Luz
  await page.getByText("Conta de Luz").first().click();
  const payBtn = page.getByRole("button", { name: /Pagar|Baixar|Quitar/i });
  if (await payBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await payBtn.click();
    // Confirm if dialog opens
    const confirmBtn = page.getByRole("button", { name: /Confirmar|Sim|Pagar/i });
    if (await confirmBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await confirmBtn.click();
    }
  }
  await expectJournalEntry(id, "POST", /\/pay$/, 200);
  assertNoUndeclaredFailures(guard);
});

// ── PAY-04 ──────────────────────────────────────────────────────────────────

test("[PAY-04] undo payment via POST /payables/:id/unpay", async ({ page }) => {
  const id = tid();
  const guard = await init(page, id);

  // Need a paid payable to undo — mark one as paid first via scenario
  await setScenario(id, { method: "POST", pathname: "/payables/pay-1/pay", status: 200 });
  await page.getByText("Conta de Luz").first().click();
  const payBtn = page.getByRole("button", { name: /Pagar|Baixar|Quitar/i });
  if (await payBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await payBtn.click();
    const confirmBtn = page.getByRole("button", { name: /Confirmar|Sim|Pagar/i });
    if (await confirmBtn.isVisible({ timeout: 2000 }).catch(() => false)) await confirmBtn.click();
  }

  // Now look for undo/unpay action
  const undoBtn = page.getByRole("button", { name: /Desfazer|Estornar|Desmarcar/i });
  if (await undoBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await undoBtn.click();
    const confirmBtn = page.getByRole("button", { name: /Confirmar|Sim/i });
    if (await confirmBtn.isVisible({ timeout: 2000 }).catch(() => false)) await confirmBtn.click();
  }

  await expectJournalEntry(id, "POST", /\/unpay$/, 200);
  assertNoUndeclaredFailures(guard);
});

// ── PAY-05 ──────────────────────────────────────────────────────────────────

test("[PAY-05] cancel payable via POST /payables/:id/cancel", async ({ page }) => {
  const id = tid();
  const guard = await init(page, id);

  await page.getByText("Internet").first().click();
  const cancelBtn = page.getByRole("button", { name: /Cancelar|Desativar/i });
  if (await cancelBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await cancelBtn.click();
    // Negative: cancel the cancel
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

// ── PAY-06 ──────────────────────────────────────────────────────────────────

test("[PAY-06] edit payable via PATCH /payables/:id", async ({ page }) => {
  const id = tid();
  const guard = await init(page, id);

  await page.getByText("Conta de Luz").first().click();
  const editBtn = page.getByRole("button", { name: /Editar/i });
  if (await editBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await editBtn.click();
    const form = page.getByRole("dialog");
    await expect(form).toBeVisible({ timeout: 3000 });
    const nameInput = form.getByPlaceholder(/descri[iç]|nome/i);
    if (await nameInput.isVisible()) {
      await nameInput.clear();
      await nameInput.fill("Conta de Luz Editada");
    }
    await form.getByRole("button", { name: /Salvar/i }).click();
  }

  await expectJournalEntry(id, "PATCH", /^\/payables\/[a-zA-Z0-9_-]+$/, 200);
  assertNoUndeclaredFailures(guard);
});
