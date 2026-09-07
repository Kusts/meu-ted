/**
 * Gate G3 contract witnesses.
 *
 * Detailed feature suites remain the source of scenario coverage; this file
 * keeps the gate contract explicit and executable in one place.
 */
import { test, expect } from "@playwright/test";
import { allowFailure, assertNoUndeclaredFailures } from "../support/failure-guard";
import {
  authenticate,
  expectJournal,
  getJournal,
  initSpec,
  prepareSpec,
} from "../support/harness";
import { FIXTURE_URL } from "../support/reset";

let sequence = 0;
function testId(): string {
  sequence += 1;
  return `g3-${sequence}`;
}

async function setScenario(testId: string, scenario: Record<string, unknown>): Promise<void> {
  const response = await fetch(`${FIXTURE_URL}/__e2e/scenario`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-e2e-test-id": testId },
    body: JSON.stringify({ testId, ...scenario }),
  });
  expect(response.ok).toBe(true);
}

async function fillExpense(page: import("@playwright/test").Page, description: string): Promise<void> {
  const dialog = page.getByRole("dialog");
  await dialog.getByPlaceholder("0,00").fill("5000");
  await dialog.getByPlaceholder("Ex: Aluguel, mercado...").fill(description);
  await dialog.getByRole("button", { name: "Alimentação" }).click();
  await dialog.getByRole("button", { name: "Conta Corrente" }).click();
}

type DeferredRequest = {
  requestSeen: Promise<void>;
  responseReleased: Promise<void>;
  markSeen: () => void;
  release: () => void;
};

function deferredRequest(): DeferredRequest {
  let markSeen!: () => void;
  let release!: () => void;
  const requestSeen = new Promise<void>((resolve) => { markSeen = resolve; });
  const responseReleased = new Promise<void>((resolve) => { release = resolve; });
  return { requestSeen, responseReleased, markSeen, release };
}

test("[G3-01] create succeeds only after the expense response", async ({ page }) => {
  const id = testId();
  const guard = await initSpec(page, id);
  const deferred = deferredRequest();
  await page.route("**/transactions/expense", async (route) => {
    const response = await route.fetch();
    deferred.markSeen();
    await deferred.responseReleased;
    await route.fulfill({ response });
  });

  await page.getByLabel("Nova transação").click();
  await fillExpense(page, "G3 create");
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: /^Salvar$/ }).click();
  await deferred.requestSeen;
  await expect(dialog).toBeVisible();
  deferred.release();
  await expect(dialog).toBeHidden();
  await expectJournal(id, "POST", "/transactions/expense", 200);
  assertNoUndeclaredFailures(guard);
});

test("[G3-02] failed save keeps draft and retry succeeds", async ({ page }) => {
  const id = testId();
  const guard = await initSpec(page, id);
  allowFailure(guard, { status: 422, reason: "expected first-attempt validation failure" });
  allowFailure(guard, { message: "422", reason: "expected first-attempt validation failure" });
  await setScenario(id, { method: "POST", pathname: "/transactions/expense", status: 422, once: true });

  await page.getByLabel("Nova transação").click();
  await fillExpense(page, "G3 retry");
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: /^Salvar$/ }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByPlaceholder("Ex: Aluguel, mercado...")).toHaveValue("G3 retry");
  await dialog.getByRole("button", { name: /^Salvar$/ }).click();
  await expect(dialog).toBeHidden();
  await expectJournal(id, "POST", "/transactions/expense", 200);
  assertNoUndeclaredFailures(guard);
});

test("[G3-03] edit persists through PATCH", async ({ page }) => {
  const id = testId();
  const guard = await prepareSpec(page, id);
  const deferred = deferredRequest();
  await page.route("**/transactions/tx-1", async (route) => {
    const response = await route.fetch();
    deferred.markSeen();
    await deferred.responseReleased;
    await route.fulfill({ response });
  });
  await page.goto("/registros");
  await authenticate(page);
  await page.getByText("Supermercado").click();
  await page.getByRole("button", { name: "Editar" }).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByText("Editar lançamento")).toBeVisible();
  await sheet.locator("input").first().fill("G3 edit");
  await page.getByRole("button", { name: "Salvar" }).click();
  await deferred.requestSeen;
  await expect(sheet).toBeVisible();
  deferred.release();
  await expect(sheet).toBeHidden();
  await expectJournal(id, "PATCH", "/transactions/tx-1", 200);
  assertNoUndeclaredFailures(guard);
});

test("[G3-04] payment closes only after a successful response", async ({ page }) => {
  const id = testId();
  const guard = await initSpec(page, id, { navigateTo: "/hub/patrimonio?aba=cartoes" });
  const deferred = deferredRequest();
  await page.route("**/cards/statements/stmt-1/pay", async (route) => {
    const response = await route.fetch();
    deferred.markSeen();
    await deferred.responseReleased;
    await route.fulfill({ response });
  });
  await page.getByText("Nubank", { exact: true }).first().click();
  await page.getByRole("button", { name: "Pagar fatura" }).click();
  await page.getByRole("button", { name: "Conta Corrente" }).click();
  await page.getByRole("button", { name: "Pagar fatura total" }).click();
  await deferred.requestSeen;
  await expect(page.getByRole("heading", { name: "Pagar fatura" })).toBeVisible();
  deferred.release();
  await expectJournal(id, "POST", "/cards/statements/stmt-1/pay", 200);
  await expect(page.getByRole("heading", { name: "Pagar fatura" })).toHaveCount(0);
  assertNoUndeclaredFailures(guard);
});

test("[G3-05] offline snapshot is read-only", async ({ page }) => {
  const id = testId();
  const guard = await initSpec(page, id);
  for (const pathname of ["/transactions", "/accounts", "/categories", "/payables", "/budgets", "/goals", "/dashboard/summary"]) {
    await setScenario(id, { method: "GET", pathname, status: 503, once: false });
    allowFailure(guard, { url: pathname, status: 503, reason: "forced offline snapshot" });
  }
  allowFailure(guard, { message: "503", reason: "forced offline snapshot" });
  await page.reload({ waitUntil: "networkidle" });
  await page.goto("/registros");
  await expect(page.getByTestId("stale-banner")).toBeVisible();
  await page.getByLabel("Nova transação").click();
  const dialog = page.getByRole("dialog");
  await dialog.getByPlaceholder("0,00").fill("5000");
  await dialog.getByPlaceholder("Ex: Aluguel, mercado...").fill("G3 offline");
  const postsBefore = (await getJournal(id)).filter((entry) => entry.method === "POST").length;
  await dialog.getByRole("button", { name: /^Salvar$/ }).click();
  await expect(dialog).toBeVisible();
  await expect(page.getByText("Backend indisponível — modo somente leitura.")).toBeVisible();
  await expect(page.getByText("G3 offline")).toHaveCount(0);
  expect((await getJournal(id)).filter((entry) => entry.method === "POST").length).toBe(postsBefore);
  assertNoUndeclaredFailures(guard);
});
