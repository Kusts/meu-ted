/**
 * Accounts E2E tests — ACC-01..06
 *
 * Labels from AccountsPage.tsx:
 *   h1: "Contas"
 *   button: "Nova conta" (opens BottomSheet "Nova conta")
 *   placeholder: "Ex: Nubank, Itaú...", "0,00"
 *   buttons in form: bank colors (Nubank, Itaú, Bradesco, Caixa, Banco Inter, C6, Outro)
 *   kinds: "Conta corrente", "Poupança", "Investimento"
 *   save: "Salvar"
 *   edit: "Editar conta"
 *   deactivate: "Desativar conta" / "Desativar"
 */

import { test, expect } from "@playwright/test";
import {
  allowFailure, assertNoUndeclaredFailures, attachGuard, createGuard,
} from "../support/failure-guard";
import { FIXTURE_URL } from "../support/reset";

const SW = { message: "reading 'waiting'", reason: "SW blocked" };
let c = 0;
function tid(): string { c += 1; return `acc-${c}`; }

async function allowCsp(page: import("@playwright/test").Page): Promise<void> {
  await page.route("**/*", async (route) => {
    try {
      const r = await route.fetch();
      const h = { ...r.headers() };
      const csp = h["content-security-policy"];
      if (csp) h["content-security-policy"] = csp.replace(/connect-src\s+([^;]+)/, "connect-src http://127.0.0.1:4010 $1").replace(/script-src\s+([^;]+)/, "script-src 'unsafe-eval' $1");
      await route.fulfill({ response: r, headers: h });
    } catch { /* ok */ }
  });
}
test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: "ignoreErrors" }); });

async function resetFixture(id: string) {
  const r = await fetch(`${FIXTURE_URL}/__e2e/reset`, { method: "POST", headers: { "Content-Type": "application/json", "x-e2e-test-id": id }, body: JSON.stringify({ testId: id, seed: "populated" }) });
  if (!r.ok) throw new Error("reset failed");
}
async function getJournal(id: string): Promise<Array<{ method: string; path: string; status: number }>> {
  const r = await fetch(`${FIXTURE_URL}/__e2e/journal?testId=${id}`, { headers: { "x-e2e-test-id": id } });
  return r.ok ? r.json() : [];
}
async function expectJournal(id: string, method: string, path: string | RegExp, status: number) {
  await expect.poll(async () => getJournal(id)).toContainEqual(expect.objectContaining({ method, path, status }));
}
async function registerDevice(page: import("@playwright/test").Page) {
  await expect(page.getByRole("button", { name: "Registrar" })).toBeVisible({ timeout: 15000 });
  await page.getByRole("button", { name: "Registrar" }).click();
  await expect(page.getByLabel("Nova transação")).toBeVisible({ timeout: 15000 });
}
async function init(page: import("@playwright/test").Page, id: string, nav = "/contas") {
  const g = createGuard(); attachGuard(page, g); await allowCsp(page); await resetFixture(id);
  await page.clock.setFixedTime("2026-07-17T12:00:00.000Z");
  await page.context().setExtraHTTPHeaders({ "x-e2e-test-id": id });
  allowFailure(g, SW);
  allowFailure(g, { url: "/profile", reason: "fixture lacks profile endpoint" });
  await page.goto("/"); await registerDevice(page);
  await page.goto(nav);
  await expect(page.getByRole("heading", { name: /Contas/ })).toBeVisible({ timeout: 10000 });
  return g;
}

test("[ACC-01] create bank account via POST /accounts", async ({ page }) => {
  const id = tid(); const g = await init(page, id);

  await page.getByRole("button", { name: "Nova", exact: true }).click();
  // BottomSheet opens with title "Nova conta"
  await expect(page.getByRole("heading", { name: "Nova conta" })).toBeVisible({ timeout: 5000 });

  // Cancel → no POST
  await page.keyboard.press("Escape");
  let j = await getJournal(id);
  expect(j.filter(e => e.method === "POST" && e.path === "/accounts")).toHaveLength(0);

  // Reopen, fill, save
  await page.getByRole("button", { name: "Nova", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Nova conta" })).toBeVisible({ timeout: 5000 });
  await page.getByPlaceholder("Ex: Nubank, Itaú...").fill("Itaú Principal");
  await page.getByPlaceholder("0,00").fill("1000,00");
  await page.getByRole("button", { name: "Salvar" }).click();

  await expect(page.getByRole("heading", { name: "Nova conta" })).toBeHidden({ timeout: 5000 });
  await expectJournal(id, "POST", "/accounts", 200);
  assertNoUndeclaredFailures(g);
});

test("[ACC-02] create cash account via POST /accounts", async ({ page }) => {
  const id = tid(); const g = await init(page, id);

  await page.getByRole("button", { name: "Nova", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Nova conta" })).toBeVisible({ timeout: 5000 });
  await page.getByPlaceholder("Ex: Nubank, Itaú...").fill("Caixa E2E");
  await page.getByPlaceholder("0,00").fill("50,00");
  await page.getByRole("button", { name: "Salvar" }).click();

  await expect(page.getByRole("heading", { name: "Nova conta" })).toBeHidden({ timeout: 5000 });
  await expectJournal(id, "POST", "/accounts", 200);
  assertNoUndeclaredFailures(g);
});

test("[ACC-03] create credit card via POST /cards", async ({ page }) => {
  const id = tid(); const g = await init(page, id);
  await page.goto("/cartoes");
  // Wait for page load
  await expect(page.getByText("Nubank").first()).toBeVisible({ timeout: 10000 });

  await page.getByRole("button", { name: "Novo", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Novo cartão" })).toBeVisible({ timeout: 5000 });

  // Cancel
  await page.keyboard.press("Escape");
  let j = await getJournal(id);
  expect(j.filter(e => e.method === "POST" && e.path === "/cards")).toHaveLength(0);

  await page.getByRole("button", { name: "Novo", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Novo cartão" })).toBeVisible({ timeout: 5000 });
  await page.getByPlaceholder("Ex: Nubank, Itaú...").fill("Inter Platinum");
  await page.getByPlaceholder("0,00").fill("3000,00");
  await page.getByRole("button", { name: "Salvar cartão" }).click();

  await expect(page.getByRole("heading", { name: "Novo cartão" })).toBeHidden({ timeout: 5000 });
  await expectJournal(id, "POST", "/cards", 200);
  assertNoUndeclaredFailures(g);
});

test("[ACC-04] edit bank account via PATCH /accounts/:id", async ({ page }) => {
  const id = tid(); const g = await init(page, id);

  // Tap account row
  await page.getByRole("button", { name: /Conta Corrente/i }).first().click();
  // Look for "Editar conta" button
  const editBtn = page.getByRole("button", { name: "Editar conta" });
  if (await editBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await editBtn.click();
    await expect(page.getByRole("heading", { name: /Editar conta/i })).toBeVisible({ timeout: 3000 });
    const nameInput = page.getByPlaceholder("Ex: Nubank, Itaú...");
    await nameInput.clear();
    await nameInput.fill("Conta Editada");
    await page.getByRole("button", { name: "Salvar" }).click();
  }
  await expectJournal(id, "PATCH", /^\/accounts\/[a-zA-Z0-9_-]+$/, 200);
  assertNoUndeclaredFailures(g);
});

test("[ACC-05] edit credit card via PATCH /cards/:id", async ({ page }) => {
  const id = tid(); const g = await init(page, id);
  await page.goto("/cartoes");
  await expect(page.getByText("Nubank")).toBeVisible({ timeout: 10000 });
  await page.getByRole("button", { name: /Nubank/i }).first().click();

  const editBtn = page.getByRole("button", { name: "Editar cartão" });
  if (await editBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await editBtn.click();
    const nameInput = page.getByPlaceholder("Ex: Nubank, Itaú...");
    if (await nameInput.isVisible({ timeout: 3000 })) {
      await nameInput.clear();
      await nameInput.fill("Nubank Editado");
      await page.getByRole("button", { name: /Salvar/i }).click();
    }
  }
  await expectJournal(id, "PATCH", /^\/cards\/[a-zA-Z0-9_-]+$/, 200);
  assertNoUndeclaredFailures(g);
});

test("[ACC-06] confirm deactivation via POST /accounts/:id/deactivate", async ({ page }) => {
  const id = tid(); const g = await init(page, id);

  await page.getByRole("button", { name: /Conta Corrente/i }).first().click();
  const deactBtn = page.getByRole("button", { name: /Desativar conta|Desativar/i });
  if (await deactBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await deactBtn.click();
    // Cancel confirmation
    const cancelBtn = page.getByRole("button", { name: /Cancelar/i });
    if (await cancelBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await cancelBtn.click();
      let j = await getJournal(id);
      expect(j.filter(e => e.method === "POST" && e.path.includes("deactivate"))).toHaveLength(0);
      await deactBtn.click();
    }
    await page.getByRole("button", { name: /Sim|Confirmar|Desativar/i }).click();
  }
  await expectJournal(id, "POST", /deactivate$/, 200);
  assertNoUndeclaredFailures(g);
});
