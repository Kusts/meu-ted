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
import { allowFailure, assertNoUndeclaredFailures } from "../support/failure-guard";
import { FIXTURE_URL } from "../support/reset";
import { initSpec, getJournal, expectJournal } from "../support/harness";


let counter = 0;

function tid(): string {
  counter += 1;
  return `tx-${counter}`;
}

async function init(page: import("@playwright/test").Page, id: string) {
  const guard = await initSpec(page, id, {
    baselineAllows: false,
    allow: [
      { message: "reading 'waiting'", reason: "SW blocked" },
    ],
  });
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
  await page.getByLabel("Novo lançamento").getByRole("button", { name: "Despesa" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Nova despesa")).toBeVisible();
  return dialog;
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

test("[TX-01] tap FAB quick menu Despesa opens expense sheet", async ({ page }) => {
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
  const before = await getJournal(id);
  const expensePostsBefore = before.filter(
    (e) => e.method === "POST" && e.path === "/transactions/expense",
  );
  expect(expensePostsBefore).toHaveLength(0);

  // Happy path (progressive disclosure: pickers open in nested sheets)
  await typeAmount(dialog, "5000");
  await dialog.getByPlaceholder("Ex: Aluguel, mercado...").fill("Mercado semanal");
  await dialog.getByRole("button", { name: "Selecionar categoria" }).click();
  const catSheet = page.getByRole("dialog").last();
  await catSheet.getByRole("button", { name: "Alimentação" }).click();
  await dialog.getByRole("button", { name: "Selecionar conta ou cartão" }).click();
  const originSheet = page.getByRole("dialog").last();
  await originSheet.getByRole("button", { name: /Conta Corrente/ }).click();
  await expect(saveBtn).toBeEnabled();
  await saveBtn.click();

  await expect(dialog).toBeHidden();
  await expectJournal(id, "POST", "/transactions/expense", 200);
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
  await dialog.getByRole("button", { name: "Selecionar categoria" }).click();
  const catSheet = page.getByRole("dialog").last();
  await catSheet.getByRole("button", { name: "Salário" }).click();
  await dialog.getByRole("button", { name: "Selecionar conta ou cartão" }).click();
  const originSheet = page.getByRole("dialog").last();
  await originSheet.getByRole("button", { name: /Conta Corrente/ }).click();

  allowFailure(guard, { message: "422", reason: "expected income validation error" });
  allowFailure(guard, { status: 422, reason: "expected income validation error" });
  await dialog.getByRole("button", { name: /^Salvar$/ }).click();

  // Negative: 422 keeps sheet open and preserves inputs
  await expectJournal(id, "POST", "/transactions/income", 422);
  await expect(dialog).toBeVisible();
  await expect(dialog.getByPlaceholder("Ex: Aluguel, mercado...")).toHaveValue(
    "Salário mensal",
  );
  await expect(dialog.getByPlaceholder("0,00")).not.toHaveValue("");

  // Retry succeeds (scenario once consumed)
  await dialog.getByRole("button", { name: /^Salvar$/ }).click();
  await expect(dialog).toBeHidden();
  await expectJournal(id, "POST", "/transactions/income", 200);
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

  // Negative: missing destination — the product keeps Transferir disabled,
  // which is a stronger no-POST guarantee than clicking; assert disabled.
  await expect(dialog.getByRole("button", { name: /^Transferir$/ })).toBeDisabled();
  await expect(dialog).toBeVisible();
  let journal = await getJournal(id);
  expect(
    journal.filter((e) => e.method === "POST" && e.path === "/transfers"),
  ).toHaveLength(0);

  // Negative: same account origin=destination — still disabled, no POST
  await contaCorrente.nth(1).click();
  await expect(dialog.getByRole("button", { name: /^Transferir$/ })).toBeDisabled();
  await expect(dialog).toBeVisible();
  journal = await getJournal(id);
  expect(
    journal.filter((e) => e.method === "POST" && e.path === "/transfers"),
  ).toHaveLength(0);

  // Happy: distinct destination (toggle dest Conta Corrente off by re-click, pick Dinheiro dest)
  await contaCorrente.nth(1).click();
  await dinheiro.nth(1).click();
  await dialog.getByRole("button", { name: /^Transferir$/ }).click();
  await expect(dialog).toBeHidden();
  await expectJournal(id, "POST", "/transfers", 200);
  assertNoUndeclaredFailures(guard);
});

// ── TX-05 ──────────────────────────────────────────────────────────────────

test("[TX-05] add category inline via create endpoint", async ({ page }) => {
  const id = tid();
  const guard = await init(page, id);

  const dialog = await openTransactionSheet(page);

  // Category picker sheet: "Cadastrar nova" creates a top-level category
  await dialog.getByRole("button", { name: "Selecionar categoria" }).click();
  const catSheet = page.getByRole("dialog").last();
  await catSheet.getByRole("button", { name: "Cadastrar nova" }).click();
  await expect(catSheet.getByPlaceholder("Nome da categoria")).toBeVisible();

  // Negative: blank name cancel — no POST /categories
  await catSheet.getByRole("button", { name: "Cancelar" }).click();
  await expect(catSheet.getByPlaceholder("Nome da categoria")).toHaveCount(0);
  const journal = await getJournal(id);
  expect(
    journal.filter((e) => e.method === "POST" && e.path === "/categories"),
  ).toHaveLength(0);

  // Happy path
  await catSheet.getByRole("button", { name: "Cadastrar nova" }).click();
  await catSheet.getByPlaceholder("Nome da categoria").fill("Mercado E2E");
  await catSheet.getByRole("button", { name: "Salvar categoria" }).click();
  await expectJournal(id, "POST", "/categories", 200);
  assertNoUndeclaredFailures(guard);
});

// ── TX-06 ──────────────────────────────────────────────────────────────────

test("[TX-06] add subcategory inline via create endpoint", async ({ page }) => {
  const id = tid();
  const guard = await init(page, id);

  const dialog = await openTransactionSheet(page);
  await dialog.getByRole("button", { name: "Selecionar categoria" }).click();
  const catSheet = page.getByRole("dialog").last();
  await catSheet.getByRole("button", { name: "Alimentação" }).click();
  await catSheet.getByRole("button", { name: /Nova subcategoria em Alimentação/ }).click();
  await expect(catSheet.getByPlaceholder("Nome da subcategoria")).toBeVisible();

  // Negative: blank cancel. The sheet unmounts on cancel (close animation
  // detaches the button mid-click), so force-dispatch and assert the outcome.
  await catSheet.getByRole("button", { name: "Cancelar" }).click({ force: true });
  await expect(catSheet.getByPlaceholder("Nome da subcategoria")).toHaveCount(0);

  await catSheet.getByRole("button", { name: /Nova subcategoria em Alimentação/ }).click();
  await catSheet.getByPlaceholder("Nome da subcategoria").fill("Hortifruti E2E");
  await catSheet.getByRole("button", { name: "Salvar subcategoria" }).click();

  await expectJournal(id, "POST", "/categories", 200);
  // parentId must be present in the create payload
  await expect
    .poll(async () => {
      const entries = await getJournal(id);
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
  // Origin sheet hosts the inline account form
  await dialog.getByRole("button", { name: "Selecionar conta ou cartão" }).click();
  const originSheet = page.getByRole("dialog").last();
  await originSheet.getByRole("button", { name: "Nova conta" }).click();
  await expect(originSheet.getByPlaceholder("Nome da conta")).toBeVisible();

  // Negative: blank cancel
  await originSheet.getByRole("button", { name: "Cancelar" }).click();
  await expect(originSheet.getByPlaceholder("Nome da conta")).toHaveCount(0);
  const journal = await getJournal(id);
  expect(
    journal.filter((e) => e.method === "POST" && e.path === "/accounts"),
  ).toHaveLength(0);

  await originSheet.getByRole("button", { name: "Nova conta" }).click();
  await originSheet.getByPlaceholder("Nome da conta").fill("Caixa E2E");
  await originSheet.getByRole("button", { name: "Salvar conta" }).click();
  await expectJournal(id, "POST", "/accounts", 200);
  assertNoUndeclaredFailures(guard);
});

// ── TX-08 ──────────────────────────────────────────────────────────────────

test("[TX-08] add card inline via create endpoint", async ({ page }) => {
  const id = tid();
  const guard = await init(page, id);

  const dialog = await openTransactionSheet(page);
  // Origin sheet (Cartão tab) hosts the inline card form. The "Selecionar
  // conta ou cartão" button contains "cartão" as substring — match exactly.
  await dialog.getByRole("button", { name: "Cartão", exact: true }).click();
  await dialog.getByRole("button", { name: "Selecionar conta ou cartão" }).click();
  const originSheet = page.getByRole("dialog").last();
  const novoCard = originSheet.getByRole("button", { name: "Novo cartão" });
  await novoCard.scrollIntoViewIfNeeded();
  await novoCard.click();
  await expect(originSheet.getByPlaceholder("Nome do cartão")).toBeVisible();

  // Negative: blank cancel
  await originSheet.getByRole("button", { name: "Cancelar" }).click();
  await expect(originSheet.getByPlaceholder("Nome do cartão")).toHaveCount(0);
  const journal = await getJournal(id);
  expect(
    journal.filter((e) => e.method === "POST" && e.path === "/cards"),
  ).toHaveLength(0);

  await novoCard.click();
  await originSheet.getByPlaceholder("Nome do cartão").fill("Inter Card E2E");
  await originSheet.getByRole("button", { name: "Salvar cartão" }).click();
  await expectJournal(id, "POST", "/cards", 200);
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
  // Card origin first (installments only exist on card origin).
  // Exact match: "Selecionar conta ou cartão" also contains the substring.
  await dialog.getByRole("button", { name: "Cartão", exact: true }).click();
  await dialog.getByRole("button", { name: "Selecionar conta ou cartão" }).click();
  const originSheet = page.getByRole("dialog").last();
  // Seed card is named "Nubank"
  const cardBtn = originSheet.getByRole("button", { name: "Nubank" });
  await cardBtn.scrollIntoViewIfNeeded();
  await cardBtn.click();
  await dialog.getByRole("button", { name: "12x" }).click();

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
  await expectJournal(id, "POST", "/cards/installments", 422);
  await expect(dialog).toBeVisible();
  await expect(dialog.getByPlaceholder("Ex: Aluguel, mercado...")).toHaveValue(
    "Notebook E2E",
  );

  // Retry succeeds
  await save12.click();
  await expect(dialog).toBeHidden();
  await expectJournal(id, "POST", "/cards/installments", 200);
  assertNoUndeclaredFailures(guard);
});
