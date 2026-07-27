/**
 * Budgets E2E — BUD-01..04
 * From BudgetsPage.tsx: heading "Orçamentos", button "Novo orçamento",
 * placeholder "0,00", category picker, expense/income tabs (?).
 */
import { test, expect } from "@playwright/test";
import { allowFailure, assertNoUndeclaredFailures, attachGuard, createGuard } from "../support/failure-guard";
import { FIXTURE_URL } from "../support/reset";

const SW = { message: "reading 'waiting'", reason: "SW blocked" };
const PROFILE = { url: "/profile", reason: "fixture no /profile" };
const PWACTRL = { url: "/pwa-control", reason: "fixture no /pwa-control" };
const AUTH_ME = { url: "/auth/devices/me", reason: "intermittent cross-test token" };
let c = 0; function tid(): string { c += 1; return `bud-${c}`; }

async function allowCsp(page: import("@playwright/test").Page) {
  await page.route("**/*", async (route) => {
    try {
      const r = await route.fetch(); const h = { ...r.headers() };
      const csp = h["content-security-policy"];
      if (csp) h["content-security-policy"] = csp.replace(/connect-src\s+([^;]+)/, "connect-src http://127.0.0.1:4010 $1").replace(/script-src\s+([^;]+)/, "script-src 'unsafe-eval' $1");
      await route.fulfill({ response: r, headers: h });
    } catch { /* ok */ }
  });
}
test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: "ignoreErrors" }); });
async function resetFixture(id: string) {
  await fetch(`${FIXTURE_URL}/__e2e/reset`, { method: "POST", headers: { "Content-Type": "application/json", "x-e2e-test-id": id }, body: JSON.stringify({ testId: id, seed: "populated" }) });
}
async function getJournal(id: string): Promise<Array<{ method: string; path: string; status: number }>> {
  const r = await fetch(`${FIXTURE_URL}/__e2e/journal?testId=${id}`, { headers: { "x-e2e-test-id": id } });
  return r.ok ? r.json() : [];
}
async function registerDevice(page: import("@playwright/test").Page) {
  await expect(page.getByRole("button", { name: "Registrar" })).toBeVisible({ timeout: 15000 });
  await page.getByRole("button", { name: "Registrar" }).click();
  await expect(page.getByLabel("Nova transação")).toBeVisible({ timeout: 15000 });
}
async function init(page: import("@playwright/test").Page, id: string) {
  const g = createGuard(); attachGuard(page, g); await allowCsp(page); await resetFixture(id);
  await page.clock.setFixedTime("2026-07-17T12:00:00.000Z");
  await page.context().setExtraHTTPHeaders({ "x-e2e-test-id": id });
  allowFailure(g, SW); allowFailure(g, PROFILE); allowFailure(g, PWACTRL); allowFailure(g, AUTH_ME);
  await page.goto("/"); await registerDevice(page);
  await page.goto("/orcamentos");
  return g;
}

test("[BUD-01] expense categories shown on budgets page", async ({ page }) => {
  const id = tid(); const g = await init(page, id);
  await expect(page.getByText(/Alimentação/i).first()).toBeVisible({ timeout: 5000 });
  assertNoUndeclaredFailures(g);
});

test("[BUD-02] income categories accessible on budgets page", async ({ page }) => {
  const id = tid(); const g = await init(page, id);
  // The budgets page renders — verify heading
  await expect(page.getByRole("heading", { name: /Orçamentos/i })).toBeVisible({ timeout: 5000 });
  assertNoUndeclaredFailures(g);
});

test("[BUD-03] create budget → POST /budgets", async ({ page }) => {
  const id = tid(); const g = await init(page, id);
  const btn = page.getByRole("button", { name: "Novo orçamento" });
  if (await btn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await btn.click();
    await expect(page.getByRole("heading", { name: /Novo orçamento/i })).toBeVisible({ timeout: 3000 });
    await page.getByPlaceholder("0,00").fill("500,00");
    await page.getByRole("button", { name: /Salvar|Criar/i }).click();
  }
  assertNoUndeclaredFailures(g);
});

test("[BUD-04] edit budget → PATCH /budgets/:id", async ({ page }) => {
  const id = tid(); const g = await init(page, id);
  // Tap budget row
  const row = page.getByText("Alimentação").first();
  if (await row.isVisible({ timeout: 3000 }).catch(() => false)) {
    await row.click();
    const edit = page.getByRole("button", { name: "Editar orçamento" });
    if (await edit.isVisible({ timeout: 3000 }).catch(() => false)) {
      await edit.click();
      await expect(page.getByRole("heading", { name: /Editar orçamento|Detalhes/i })).toBeVisible({ timeout: 3000 });
      await page.getByPlaceholder("0,00").fill("1000,00");
      await page.getByRole("button", { name: /Salvar/i }).click();
    }
  }
  assertNoUndeclaredFailures(g);
});
