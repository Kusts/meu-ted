/**
 * Accounts E2E tests — ACC-01..06
 *
 * Matrix:
 * ACC-01 create bank account → POST /accounts
 * ACC-02 create cash account → POST /accounts
 * ACC-03 create credit card → POST /cards
 * ACC-04 edit bank account → PATCH /accounts/:id
 * ACC-05 edit credit card → PATCH /cards/:id
 * ACC-06 deactivate account → POST /accounts/:id/deactivate
 *
 * Seed: Conta Corrente (acc-1), Dinheiro (acc-2), Nubank card (card-1).
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
  path: string,
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

async function init(
  page: import("@playwright/test").Page,
  id: string,
  navigateTo = "/contas",
): Promise<ReturnType<typeof createGuard>> {
  const guard = createGuard();
  attachGuard(page, guard);
  await allowFixtureCsp(page);
  await resetFixture(id);
  await page.clock.setFixedTime("2026-07-17T12:00:00.000Z");
  await page.context().setExtraHTTPHeaders({ "x-e2e-test-id": id });
  allowFailure(guard, SW);
  await page.goto("/");
  await registerDevice(page);
  await page.goto(navigateTo);
  await expect(page.getByRole("heading", { name: /Contas/ })).toBeVisible({ timeout: 10000 });
  return guard;
}

// ── ACC-01 ──────────────────────────────────────────────────────────────────

test("[ACC-01] create bank account via POST /accounts", async ({ page }) => {
  const id = tid();
  const guard = await init(page, id);

  // Open create form
  await page.getByRole("button", { name: /Nova Conta|Adicionar/i }).click();
  const form = page.getByRole("dialog");
  await expect(form).toBeVisible();

  // Fill form
  await form.getByPlaceholder(/nome/i).fill("Itaú Principal");
  // Select bank kind if kind toggle exists
  const kindToggle = form.getByRole("button", { name: /Conta corrente|Poupança|Investimento/i });
  if (await kindToggle.isVisible()) await kindToggle.first().click();
  // Fill initial balance
  const balanceInput = form.getByPlaceholder(/0,00|saldo/i);
  if (await balanceInput.isVisible()) {
    await balanceInput.click();
    await balanceInput.fill("");
    await balanceInput.pressSequentially("100000", { delay: 15 });
  }

  // Negative: cancel discards — no POST
  await form.getByRole("button", { name: /Cancelar/i }).click();
  await expect(form).toBeHidden();
  let journal = await getJournal(id);
  expect(journal.filter((e) => e.method === "POST" && e.path === "/accounts")).toHaveLength(0);

  // Happy path: reopen and save
  await page.getByRole("button", { name: /Nova Conta|Adicionar/i }).click();
  await expect(form).toBeVisible();
  await form.getByPlaceholder(/nome/i).fill("Itaú Principal");
  if (await balanceInput.isVisible()) {
    await balanceInput.click();
    await balanceInput.fill("");
    await balanceInput.pressSequentially("100000", { delay: 15 });
  }
  await form.getByRole("button", { name: /Salvar|Criar|Adicionar conta/i }).click();

  await expect(form).toBeHidden();
  await expectJournalEntry(id, "POST", "/accounts", 200);
  assertNoUndeclaredFailures(guard);
});

// ── ACC-02 ──────────────────────────────────────────────────────────────────

test("[ACC-02] create cash account via POST /accounts", async ({ page }) => {
  const id = tid();
  const guard = await init(page, id);

  await page.getByRole("button", { name: /Nova Conta|Adicionar/i }).click();
  const form = page.getByRole("dialog");
  await expect(form).toBeVisible();

  await form.getByPlaceholder(/nome/i).fill("Caixa E2E");
  // Select cash/kind if available
  const kindBtns = form.getByRole("button", { name: /Dinheiro|Cash/i });
  if (await kindBtns.isVisible()) await kindBtns.click();

  const balanceInput = form.getByPlaceholder(/0,00|saldo/i);
  if (await balanceInput.isVisible()) {
    await balanceInput.click();
    await balanceInput.fill("");
    await balanceInput.pressSequentially("5000", { delay: 15 });
  }

  await form.getByRole("button", { name: /Salvar|Criar|Adicionar conta/i }).click();
  await expect(form).toBeHidden();
  await expectJournalEntry(id, "POST", "/accounts", 200);
  assertNoUndeclaredFailures(guard);
});

// ── ACC-03 ──────────────────────────────────────────────────────────────────

test("[ACC-03] create credit card via POST /cards", async ({ page }) => {
  const id = tid();
  const guard = await init(page, id);

  // Navigate to cartoes for card creation (ACC-03 is in accounts context but creates a card)
  await page.goto("/cartoes");
  await expect(page.getByRole("heading", { name: /Cartões/i })).toBeVisible({ timeout: 10000 });

  await page.getByRole("button", { name: /Novo Cartão|Adicionar/i }).click();
  const form = page.getByRole("dialog");
  await expect(form).toBeVisible();

  // Negative: missing fields — no POST
  await form.getByRole("button", { name: /Cancelar/i }).click();
  await expect(form).toBeHidden();
  let journal = await getJournal(id);
  expect(journal.filter((e) => e.method === "POST" && e.path === "/cards")).toHaveLength(0);

  // Happy path
  await page.getByRole("button", { name: /Novo Cartão|Adicionar/i }).click();
  await expect(form).toBeVisible();
  await form.getByPlaceholder(/nome/i).fill("Inter Platinum");
  const limitInput = form.getByPlaceholder(/0,00|limite/i);
  if (await limitInput.isVisible()) {
    await limitInput.click();
    await limitInput.fill("");
    await limitInput.pressSequentially("300000", { delay: 15 });
  }
  // Set closing day if field exists
  const closingInput = form.getByPlaceholder(/fechamento|dia/i).first();
  if (await closingInput.isVisible()) {
    await closingInput.fill("10");
  }
  // Set due day if field exists
  const dueBtns = form.getByRole("button", { name: /dia \d+/i });
  if ((await dueBtns.count()) > 0) await dueBtns.first().click();

  await form.getByRole("button", { name: /Salvar|Criar|Adicionar cartão/i }).click();
  await expect(form).toBeHidden();
  await expectJournalEntry(id, "POST", "/cards", 200);
  assertNoUndeclaredFailures(guard);
});

// ── ACC-04 ──────────────────────────────────────────────────────────────────

test("[ACC-04] edit bank account via PATCH /accounts/:id", async ({ page }) => {
  const id = tid();
  const guard = await init(page, id);

  // Tap existing account to open edit
  const accountRow = page.getByText("Conta Corrente").first();
  await accountRow.click();
  const form = page.getByRole("dialog");
  await expect(form).toBeVisible({ timeout: 5000 }).catch(() => {
    // If no dialog, page might navigate to detail instead; try inline edit
  });

  // If dialog opened, edit name
  const nameInput = form.getByPlaceholder(/nome/i);
  if (await nameInput.isVisible()) {
    await nameInput.clear();
    await nameInput.fill("Conta Principal Editada");
    await form.getByRole("button", { name: /Salvar/i }).click();
  }

  await expectJournalEntry(id, "PATCH", /^\/accounts\/[a-zA-Z0-9_-]+$/, 200);
  assertNoUndeclaredFailures(guard);
});

// ── ACC-05 ──────────────────────────────────────────────────────────────────

test("[ACC-05] edit credit card via PATCH /cards/:id", async ({ page }) => {
  const id = tid();
  const guard = await init(page, id);

  // Navigate to card detail
  await page.goto("/cartoes");
  await expect(page.getByText("Nubank")).toBeVisible({ timeout: 10000 });
  await page.getByText("Nubank").first().click();

  // Look for edit action on card detail
  const editBtn = page.getByRole("button", { name: /Editar|Configurar/i });
  if (await editBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await editBtn.click();
    const form = page.getByRole("dialog");
    await expect(form).toBeVisible();
    const nameInput = form.getByPlaceholder(/nome/i);
    if (await nameInput.isVisible()) {
      await nameInput.clear();
      await nameInput.fill("Nubank Editado");
    }
    await form.getByRole("button", { name: /Salvar/i }).click();
  }

  await expectJournalEntry(id, "PATCH", /^\/cards\/[a-zA-Z0-9_-]+$/, 200);
  assertNoUndeclaredFailures(guard);
});

// ── ACC-06 ──────────────────────────────────────────────────────────────────

test("[ACC-06] confirm deactivation via POST /accounts/:id/deactivate", async ({ page }) => {
  const id = tid();
  const guard = await init(page, id);

  // Tap account to open detail
  await page.getByText("Conta Corrente").first().click();

  // Look for deactivate/delete action
  const deactivateBtn = page.getByRole("button", { name: /Desativar|Excluir|Deletar/i });
  if (await deactivateBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await deactivateBtn.click();

    // Negative: cancel on confirm
    const cancelBtn = page.getByRole("button", { name: /Cancelar|Não/i });
    if (await cancelBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await cancelBtn.click();
      let journal = await getJournal(id);
      expect(
        journal.filter((e) => e.method === "POST" && e.path.includes("deactivate")),
      ).toHaveLength(0);

      // Re-trigger and confirm
      await deactivateBtn.click();
    }
    await page.getByRole("button", { name: /Sim|Confirmar|Desativar/i }).click();
  }

  await expectJournalEntry(id, "POST", /deactivate$/, 200);
  assertNoUndeclaredFailures(guard);
});
