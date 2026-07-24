/**
 * Transaction sheet E2E tests — TX-01..09
 *
 * Matrix:
 * TX-01 FAB opens expense sheet
 * TX-02 expense → POST /transactions/expense + required validation
 * TX-03 income → POST /transactions/income + 422 preserves inputs
 * TX-04 transfer → POST /transfers + same/missing account rejected
 * TX-05 inline category → POST /categories + blank cancel
 * TX-06 inline subcategory → POST /categories parentId + blank cancel
 * TX-07 inline account → POST /accounts + blank cancel
 * TX-08 inline card → POST /cards + blank cancel
 * TX-09 installments → POST /cards/installments + 422 then success
 *
 * Seed accounts: Conta Corrente, Dinheiro, Nubank (card)
 * Seed categories: Alimentação, Transporte, Salário, Sub-alimentação
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
  return `tx-${counter}`;
}

async function allowFixtureCsp(page: import("@playwright/test").Page): Promise<void> {
  await page.route("**", async (route) => {
    const response = await route.fetch();
    const csp = response.headers()["content-security-policy"];
    if (csp) {
      const modified = csp
        .replace(/connect-src\s+([^;]+)/, "connect-src http://127.0.0.1:4010 $1")
        .replace(/script-src\s+([^;]+)/, "script-src 'unsafe-eval' $1");
      await route.fulfill({
        response,
        headers: { ...response.headers(), "content-security-policy": modified },
      });
    } else {
      await route.fulfill({ response });
    }
  });
}

async function resetFixture(testId: string, seed = "populated") {
  const response = await fetch(`${FIXTURE_URL}/__e2e/reset`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-e2e-test-id": testId },
    body: JSON.stringify({ testId, seed }),
  });
  expect(response.ok).toBe(true);
}

async function registerDevice(page: import("@playwright/test").Page): Promise<void> {
  const registerButton = page.getByRole("button", { name: "Registrar" });
  await expect(registerButton).toBeVisible({ timeout: 15000 });
  await registerButton.click();
  await expect(page.getByLabel("Nova transação")).toBeVisible({ timeout: 15000 });
}

async function getJournalEntries(
  testId: string,
): Promise<Array<{ method: string; path: string; status: number; body?: unknown }>> {
  const response = await fetch(`${FIXTURE_URL}/__e2e/journal?testId=${testId}`, {
    headers: { "x-e2e-test-id": testId },
  });
  if (!response.ok) return [];
  return response.json();
}

async function init(page: import("@playwright/test").Page, id: string) {
  const guard = createGuard();
  attachGuard(page, guard);
  await allowFixtureCsp(page);
  await resetFixture(id);
  await page.clock.setFixedTime("2026-07-17T12:00:00.000Z");
  await page.context().setExtraHTTPHeaders({ "x-e2e-test-id": id });
  allowFailure(guard, SW);
  await page.goto("/");
  await registerDevice(page);
  return guard;
}

async function setScenario(testId: string, scenario: Record<string, unknown>) {
  const response = await fetch(`${FIXTURE_URL}/__e2e/scenario`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-e2e-test-id": testId },
    body: JSON.stringify({ testId, ...scenario }),
  });
  expect(response.ok).toBe(true);
}

async function openTransactionSheet(page: import("@playwright/test").Page) {
  await page.getByLabel("Nova transação").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Novo lançamento")).toBeVisible();
  return dialog;
}

async function expectJournalEntry(
  testId: string,
  method: string,
  path: string,
  status: number,
) {
  await expect
    .poll(async () => getJournalEntries(testId))
    .toContainEqual(expect.objectContaining({ method, path, status }));
}

async function typeAmount(
  dialog: import("@playwright/test").Locator,
  digits: string,
) {
  const input = dialog.getByPlaceholder("0,00");
  await input.click();
  await input.fill("");
  await input.pressSequentially(digits, { delay: 15 });
}

// ── TX-01 ──────────────────────────────────────────────────────────────────

test("[TX-01] tap FAB opens expense sheet", async ({ page }) => {
  const id = tid();
  const guard = await init(page, id);

  const dialog = await openTransactionSheet(page);

  await expect(dialog.getByRole("button", { name: /^Despesa$/ })).toBeVisible();
  await expect(dialog.getByRole("button", { name: /^Receita$/ })).toBeVisible();
  await expect(dialog.getByRole("button", { name: /^Transferência$/ })).toBeVisible();
  await expect(dialog.getByPlaceholder("0,00")).toBeVisible();
  await expect(dialog.getByPlaceholder("Ex: Aluguel, mercado...")).toBeVisible();
  await expect(dialog.getByRole("button", { name: /^Salvar$/ })).toBeDisabled();
  assertNoUndeclaredFailures(guard);
});

// ── TX-02 ──────────────────────────────────────────────────────────────────

test("[TX-02] save expense via POST /transactions/expense with validation", async ({
  page,
}) => {
  const id = tid();
  const guard = await init(page, id);

  const dialog = await openTransactionSheet(page);

  // Negative: zero amount keeps Salvar disabled — no POST
  const saveBtn = dialog.getByRole("button", { name: /^Salvar$/ });
  await expect(saveBtn).toBeDisabled();
  const before = await getJournalEntries(id);
  const expensePostsBefore = before.filter(
    (e) => e.method === "POST" && e.path === "/transactions/expense",
  );
  expect(expensePostsBefore).toHaveLength(0);

  // Happy path
  await typeAmount(dialog, "5000");
  await dialog.getByPlaceholder("Ex: Aluguel, mercado...").fill("Mercado semanal");
  await dialog.getByRole("button", { name: "Alimentação" }).click();
  await dialog.getByRole("button", { name: "Conta Corrente" }).click();
  await expect(saveBtn).toBeEnabled();
  await saveBtn.click();

  await expect(dialog).toBeHidden();
  await expectJournalEntry(id, "POST", "/transactions/expense", 200);
  assertNoUndeclaredFailures(guard);
});

// ── TX-03 ──────────────────────────────────────────────────────────────────

test("[TX-03] save income via POST /transactions/income with 422 preserved", async ({
  page,
}) => {
  const id = tid();
  const guard = await init(page, id);
  await setScenario(id, {
    method: "POST",
    pathname: "/transactions/income",
    status: 422,
    once: true,
  });

  const dialog = await openTransactionSheet(page);
  await dialog.getByRole("button", { name: /^Receita$/ }).click();
  await typeAmount(dialog, "500000");
  await dialog.getByPlaceholder("Ex: Aluguel, mercado...").fill("Salário mensal");
  await dialog.getByRole("button", { name: "Salário" }).click();
  await dialog.getByRole("button", { name: "Conta Corrente" }).click();

  allowFailure(guard, { message: "422", reason: "expected income validation error" });
  allowFailure(guard, { status: 422, reason: "expected income validation error" });
  await dialog.getByRole("button", { name: /^Salvar$/ }).click();

  // Negative: 422 keeps sheet open and preserves inputs
  await expectJournalEntry(id, "POST", "/transactions/income", 422);
  await expect(dialog).toBeVisible();
  await expect(dialog.getByPlaceholder("Ex: Aluguel, mercado...")).toHaveValue(
    "Salário mensal",
  );
  await expect(dialog.getByPlaceholder("0,00")).not.toHaveValue("");

  // Retry succeeds (scenario once consumed)
  await dialog.getByRole("button", { name: /^Salvar$/ }).click();
  await expect(dialog).toBeHidden();
  await expectJournalEntry(id, "POST", "/transactions/income", 200);
  assertNoUndeclaredFailures(guard);
});

// ── TX-04 ──────────────────────────────────────────────────────────────────

test("[TX-04] save transfer via POST /transfers with invalid same account rejected", async ({
  page,
}) => {
  const id = tid();
  const guard = await init(page, id);

  const dialog = await openTransactionSheet(page);
  await dialog.getByRole("button", { name: /^Transferência$/ }).click();
  await typeAmount(dialog, "10000");
  await dialog.getByPlaceholder("Ex: Aluguel, mercado...").fill("PIX para reserva");

  // Transfer chips: [0]=origin Conta Corrente, [1]=dest Conta Corrente,
  // [0]/[1] for Dinheiro similarly across the two sections.
  const contaCorrente = dialog.getByRole("button", { name: /Conta Corrente/ });
  const dinheiro = dialog.getByRole("button", { name: /Dinheiro/ });

  // Origin only
  await contaCorrente.nth(0).click();

  // Negative: missing destination — Transferir must not POST
  await dialog.getByRole("button", { name: /^Transferir$/ }).click();
  await expect(dialog).toBeVisible();
  let journal = await getJournalEntries(id);
  expect(
    journal.filter((e) => e.method === "POST" && e.path === "/transfers"),
  ).toHaveLength(0);

  // Negative: same account origin=destination — no POST
  await contaCorrente.nth(1).click();
  await dialog.getByRole("button", { name: /^Transferir$/ }).click();
  await expect(dialog).toBeVisible();
  journal = await getJournalEntries(id);
  expect(
    journal.filter((e) => e.method === "POST" && e.path === "/transfers"),
  ).toHaveLength(0);

  // Happy: distinct destination (toggle dest Conta Corrente off by re-click, pick Dinheiro dest)
  await contaCorrente.nth(1).click();
  await dinheiro.nth(1).click();
  await dialog.getByRole("button", { name: /^Transferir$/ }).click();
  await expect(dialog).toBeHidden();
  await expectJournalEntry(id, "POST", "/transfers", 200);
  assertNoUndeclaredFailures(guard);
});

// ── TX-05 ──────────────────────────────────────────────────────────────────

test("[TX-05] add category inline via create endpoint", async ({ page }) => {
  const id = tid();
  const guard = await init(page, id);

  const dialog = await openTransactionSheet(page);

  // Open inline category form (first "Nova" is category section)
  await dialog.getByText("Nova").first().click();
  await expect(dialog.getByPlaceholder("Nome da categoria")).toBeVisible();

  // Negative: blank name cancel — no POST /categories
  await dialog.getByRole("button", { name: "Cancelar" }).click();
  await expect(dialog.getByPlaceholder("Nome da categoria")).toHaveCount(0);
  const journal = await getJournalEntries(id);
  expect(
    journal.filter((e) => e.method === "POST" && e.path === "/categories"),
  ).toHaveLength(0);

  // Happy path
  await dialog.getByText("Nova").first().click();
  await dialog.getByPlaceholder("Nome da categoria").fill("Mercado E2E");
  await dialog.getByRole("button", { name: "Salvar categoria" }).click();
  await expectJournalEntry(id, "POST", "/categories", 200);
  assertNoUndeclaredFailures(guard);
});

// ── TX-06 ──────────────────────────────────────────────────────────────────

test("[TX-06] add subcategory inline via create endpoint", async ({ page }) => {
  const id = tid();
  const guard = await init(page, id);

  const dialog = await openTransactionSheet(page);
  await dialog.getByRole("button", { name: "Alimentação" }).click();
  await dialog.getByText("Nova subcat.").click();
  await expect(dialog.getByPlaceholder("Nome da subcategoria")).toBeVisible();

  // Negative: blank cancel
  await dialog.getByRole("button", { name: "Cancelar" }).click();
  await expect(dialog.getByPlaceholder("Nome da subcategoria")).toHaveCount(0);

  await dialog.getByText("Nova subcat.").click();
  await dialog.getByPlaceholder("Nome da subcategoria").fill("Hortifruti E2E");
  await dialog.getByRole("button", { name: "Salvar subcategoria" }).click();

  await expectJournalEntry(id, "POST", "/categories", 200);
  // parentId must be present in the create payload
  await expect
    .poll(async () => {
      const entries = await getJournalEntries(id);
      const post = entries.find(
        (e) => e.method === "POST" && e.path === "/categories",
      );
      return (post?.body as { parentId?: string } | undefined)?.parentId ?? null;
    })
    .toBe("cat-1");
  assertNoUndeclaredFailures(guard);
});

// ── TX-07 ──────────────────────────────────────────────────────────────────

test("[TX-07] add account inline via create endpoint", async ({ page }) => {
  const id = tid();
  const guard = await init(page, id);

  const dialog = await openTransactionSheet(page);
  // Second "Nova" is account section
  await dialog.getByText("Nova").nth(1).click();
  await expect(dialog.getByPlaceholder("Nome da conta")).toBeVisible();

  // Negative: blank cancel
  await dialog.getByRole("button", { name: "Cancelar" }).click();
  await expect(dialog.getByPlaceholder("Nome da conta")).toHaveCount(0);
  const journal = await getJournalEntries(id);
  expect(
    journal.filter((e) => e.method === "POST" && e.path === "/accounts"),
  ).toHaveLength(0);

  await dialog.getByText("Nova").nth(1).click();
  await dialog.getByPlaceholder("Nome da conta").fill("Caixa E2E");
  await dialog.getByRole("button", { name: "Salvar conta" }).click();
  await expectJournalEntry(id, "POST", "/accounts", 200);
  assertNoUndeclaredFailures(guard);
});

// ── TX-08 ──────────────────────────────────────────────────────────────────

test("[TX-08] add card inline via create endpoint", async ({ page }) => {
  const id = tid();
  const guard = await init(page, id);

  const dialog = await openTransactionSheet(page);
  // Card section "Novo" — scroll into view
  const novoCard = dialog.getByRole("button", { name: "Novo" });
  await novoCard.scrollIntoViewIfNeeded();
  await novoCard.click();
  await expect(dialog.getByPlaceholder("Nome do cartão")).toBeVisible();

  // Negative: blank cancel
  await dialog.getByRole("button", { name: "Cancelar" }).click();
  await expect(dialog.getByPlaceholder("Nome do cartão")).toHaveCount(0);
  const journal = await getJournalEntries(id);
  expect(
    journal.filter((e) => e.method === "POST" && e.path === "/cards"),
  ).toHaveLength(0);

  await novoCard.click();
  await dialog.getByPlaceholder("Nome do cartão").fill("Inter Card E2E");
  await dialog.getByRole("button", { name: "Salvar cartão" }).click();
  await expectJournalEntry(id, "POST", "/cards", 200);
  assertNoUndeclaredFailures(guard);
});

// ── TX-09 ──────────────────────────────────────────────────────────────────

test("[TX-09] save installments via POST /cards/installments with invalid count handled", async ({
  page,
}) => {
  const id = tid();
  const guard = await init(page, id);
  await setScenario(id, {
    method: "POST",
    pathname: "/cards/installments",
    status: 422,
    once: true,
  });

  const dialog = await openTransactionSheet(page);
  await typeAmount(dialog, "600000");
  await dialog.getByPlaceholder("Ex: Aluguel, mercado...").fill("Notebook E2E");
  await dialog.getByLabel("Alternar parcelamento").click();
  await dialog.getByRole("button", { name: "12x" }).click();

  // Seed card is named "Nubank"
  const cardBtn = dialog.getByRole("button", { name: "Nubank" });
  await cardBtn.scrollIntoViewIfNeeded();
  await cardBtn.click();

  allowFailure(guard, {
    message: "422",
    reason: "expected installments validation error",
  });
  allowFailure(guard, {
    status: 422,
    reason: "expected installments validation error",
  });
  const save12 = dialog.getByRole("button", { name: /Salvar em 12x/ });
  await save12.click();

  // Negative: 422 keeps sheet open
  await expectJournalEntry(id, "POST", "/cards/installments", 422);
  await expect(dialog).toBeVisible();
  await expect(dialog.getByPlaceholder("Ex: Aluguel, mercado...")).toHaveValue(
    "Notebook E2E",
  );

  // Retry succeeds
  await save12.click();
  await expect(dialog).toBeHidden();
  await expectJournalEntry(id, "POST", "/cards/installments", 200);
  assertNoUndeclaredFailures(guard);
});
