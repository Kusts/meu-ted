/**
 * Cards E2E tests — CARD-01..08
 *
 * Matrix:
 * CARD-01 create card → POST /cards
 * CARD-02 edit card → PATCH /cards/:id
 * CARD-03 tap card row → detail opens
 * CARD-04 full statement payment → POST /cards/statements/:id/pay
 * CARD-05 partial statement payment → POST /cards/statements/:id/pay
 * CARD-06 tap statement row → line items show
 * CARD-07 tap purchase row → purchase detail shows
 * CARD-08 edit purchase → PATCH /cards/purchases/:id
 *
 * Seed: Nubank (card-1, limit 5000.00, spend 1200.00), stmt-1 (open, 1200.00),
 * purchases: Amazon (pur-1, 450.00), iFood (pur-2, 350.00).
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
  await page.goto("/cartoes");
  await expect(page.getByRole("heading", { name: /Cartões/i })).toBeVisible({ timeout: 10000 });
  return guard;
}

// ── CARD-01 ─────────────────────────────────────────────────────────────────

test("[CARD-01] create card via POST /cards", async ({ page }) => {
  const id = tid();
  const guard = await init(page, id);

  await page.getByRole("button", { name: /Novo Cartão|Adicionar/i }).click();
  const form = page.getByRole("dialog");
  await expect(form).toBeVisible({ timeout: 5000 });

  // Negative: cancel without saving
  await form.getByRole("button", { name: /Cancelar/i }).click();
  await expect(form).toBeHidden();
  let journal = await getJournal(id);
  expect(journal.filter((e) => e.method === "POST" && e.path === "/cards")).toHaveLength(0);

  // Happy path
  await page.getByRole("button", { name: /Novo Cartão|Adicionar/i }).click();
  await expect(form).toBeVisible({ timeout: 5000 });
  const nameInput = form.getByPlaceholder(/nome/i);
  await nameInput.fill("XP Visa Infinite");
  const limitInput = form.getByPlaceholder(/0,00|limite/i);
  if (await limitInput.isVisible()) {
    await limitInput.click();
    await limitInput.fill("");
    await limitInput.pressSequentially("1000000", { delay: 15 });
  }
  await form.getByRole("button", { name: /Salvar|Criar|Adicionar cartão/i }).click();
  await expect(form).toBeHidden();
  await expectJournalEntry(id, "POST", "/cards", 200);
  assertNoUndeclaredFailures(guard);
});

// ── CARD-02 ─────────────────────────────────────────────────────────────────

test("[CARD-02] edit card via PATCH /cards/:id", async ({ page }) => {
  const id = tid();
  const guard = await init(page, id);

  // Tap Nubank card to enter detail
  await page.getByText("Nubank").first().click();
  await expect(page.getByRole("heading", { name: /Nubank|Detalhes/i })).toBeVisible({ timeout: 5000 });

  // Find edit action
  const editBtn = page.getByRole("button", { name: /Editar|Configurar/i });
  if (await editBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await editBtn.click();
    const form = page.getByRole("dialog");
    await expect(form).toBeVisible({ timeout: 3000 });
    const nameInput = form.getByPlaceholder(/nome/i);
    await nameInput.clear();
    await nameInput.fill("Nubank Ultra");
    await form.getByRole("button", { name: /Salvar/i }).click();
  }

  await expectJournalEntry(id, "PATCH", /^\/cards\/[a-zA-Z0-9_-]+$/, 200);
  assertNoUndeclaredFailures(guard);
});

// ── CARD-03 ─────────────────────────────────────────────────────────────────

test("[CARD-03] tap card row opens detail", async ({ page }) => {
  const id = tid();
  const guard = await init(page, id);

  // Tap card entry
  await page.getByText("Nubank").first().click();
  // Assert detail navigation (limit info visible)
  await expect(page.getByText(/R\$\s*5\.?000|5\.000|limite/i)).toBeVisible({ timeout: 5000 });
  // Assert no unexpected write mutations from detail load
  const journal = await getJournal(id);
  const writes = journal.filter(
    (e) => ["POST", "PUT", "PATCH", "DELETE"].includes(e.method) && !e.path.startsWith("/auth"),
  );
  expect(writes).toHaveLength(0);
  assertNoUndeclaredFailures(guard);
});

// ── CARD-04 ─────────────────────────────────────────────────────────────────

test("[CARD-04] full statement payment via POST /cards/statements/:id/pay", async ({ page }) => {
  const id = tid();
  const guard = await init(page, id);

  // Navigate to card detail
  await page.getByText("Nubank").first().click();
  await expect(page.getByText(/fatura/i)).toBeVisible({ timeout: 5000 });

  // Find pay/pagar button
  const payBtn = page.getByRole("button", { name: /Pagar|Pagamento/i });
  if (await payBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await payBtn.click();
    const form = page.getByRole("dialog");
    await expect(form).toBeVisible({ timeout: 3000 });

    // Select source account
    const sourceBtn = form.getByRole("button", { name: /Conta Corrente/i });
    if (await sourceBtn.isVisible()) await sourceBtn.click();

    // Negative: cancel
    await form.getByRole("button", { name: /Cancelar/i }).click();
    await expect(form).toBeHidden();
    let journal = await getJournal(id);
    expect(
      journal.filter((e) => e.method === "POST" && e.path.includes("/pay")),
    ).toHaveLength(0);

    // Happy path: reopen and confirm full payment
    await payBtn.click();
    await expect(form).toBeVisible({ timeout: 3000 });
    if (await sourceBtn.isVisible()) await sourceBtn.click();
    // Select full payment (100%) if percentage toggles exist
    const fullBtn = form.getByRole("button", { name: /100%|Total/i });
    if (await fullBtn.isVisible({ timeout: 2000 }).catch(() => false)) await fullBtn.click();
    await form.getByRole("button", { name: /Pagar|Confirmar/i }).click();
  }

  await expectJournalEntry(id, "POST", /\/pay$/, 200);
  assertNoUndeclaredFailures(guard);
});

// ── CARD-05 ─────────────────────────────────────────────────────────────────

test("[CARD-05] partial statement payment via POST /cards/statements/:id/pay", async ({ page }) => {
  const id = tid();
  const guard = await init(page, id);

  await page.getByText("Nubank").first().click();
  await expect(page.getByText(/fatura/i)).toBeVisible({ timeout: 5000 });

  const payBtn = page.getByRole("button", { name: /Pagar|Pagamento/i });
  if (await payBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await payBtn.click();
    const form = page.getByRole("dialog");
    await expect(form).toBeVisible({ timeout: 3000 });

    const sourceBtn = form.getByRole("button", { name: /Conta Corrente/i });
    if (await sourceBtn.isVisible()) await sourceBtn.click();

    // Select partial payment (50%)
    const partialBtn = form.getByRole("button", { name: /50%|Parcial/i });
    if (await partialBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await partialBtn.click();
    } else {
      // Manual partial: set custom amount
      const amountInput = form.getByPlaceholder(/0,00|valor/i);
      if (await amountInput.isVisible()) {
        await amountInput.fill("60000"); // pay half
      }
    }

    await form.getByRole("button", { name: /Pagar|Confirmar/i }).click();
  }

  await expectJournalEntry(id, "POST", /\/pay$/, 200);
  assertNoUndeclaredFailures(guard);
});

// ── CARD-06 ─────────────────────────────────────────────────────────────────

test("[CARD-06] tap statement row opens line items", async ({ page }) => {
  const id = tid();
  const guard = await init(page, id);

  await page.getByText("Nubank").first().click();
  await expect(page.getByText(/fatura/i)).toBeVisible({ timeout: 5000 });

  // Tap on statement/fatura row
  const stmtRow = page.getByText(/Jul|fechamento/i).first();
  if (await stmtRow.isVisible({ timeout: 3000 }).catch(() => false)) {
    await stmtRow.click();
  }

  // Assert statement detail shows purchases
  await expect(page.getByText(/Amazon|iFood/i).first()).toBeVisible({ timeout: 5000 });
  // No unexpected writes
  const journal = await getJournal(id);
  const writes = journal.filter(
    (e) => ["POST", "PUT", "PATCH", "DELETE"].includes(e.method) && !e.path.startsWith("/auth"),
  );
  expect(writes).toHaveLength(0);
  assertNoUndeclaredFailures(guard);
});

// ── CARD-07 ─────────────────────────────────────────────────────────────────

test("[CARD-07] tap purchase row shows detail", async ({ page }) => {
  const id = tid();
  const guard = await init(page, id);

  await page.getByText("Nubank").first().click();
  await expect(page.getByText(/fatura/i)).toBeVisible({ timeout: 5000 });

  // Tap purchase directly (Amazon)
  await page.getByText("Amazon").first().click();
  await expect(page.getByText(/R\$\s*450|450,00/i)).toBeVisible({ timeout: 5000 });

  const journal = await getJournal(id);
  const writes = journal.filter(
    (e) => ["POST", "PUT", "PATCH", "DELETE"].includes(e.method) && !e.path.startsWith("/auth"),
  );
  expect(writes).toHaveLength(0);
  assertNoUndeclaredFailures(guard);
});

// ── CARD-08 ─────────────────────────────────────────────────────────────────

test("[CARD-08] edit purchase via PATCH /cards/purchases/:id", async ({ page }) => {
  const id = tid();
  const guard = await init(page, id);

  await page.getByText("Nubank").first().click();
  await expect(page.getByText(/fatura/i)).toBeVisible({ timeout: 5000 });

  // Navigate to purchase detail
  await page.getByText("Amazon").first().click();
  await expect(page.getByText(/Amazon/i)).toBeVisible({ timeout: 5000 });

  // Find edit action on purchase
  const editBtn = page.getByRole("button", { name: /Editar/i });
  if (await editBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await editBtn.click();
    const form = page.getByRole("dialog");
    await expect(form).toBeVisible({ timeout: 3000 });

    const descInput = form.getByPlaceholder(/descri[iç]|nome/i);
    if (await descInput.isVisible()) {
      await descInput.clear();
      await descInput.fill("Amazon Prime E2E");
    }
    const amountInput = form.getByPlaceholder(/0,00|valor/i);
    if (await amountInput.isVisible()) {
      await amountInput.fill("5000");
    }
    await form.getByRole("button", { name: /Salvar/i }).click();
  }

  await expectJournalEntry(id, "PATCH", /purchases/, 200);
  assertNoUndeclaredFailures(guard);
});
