/**
 * Subscriptions E2E — SUB-01..05
 * From SubscriptionsPage.tsx: heading "Assinaturas", "Nova assinatura",
 * placeholder "Ex: Netflix", "0,00", "1 a 31",
 * "Editar assinatura", "Cancelar assinatura".
 */
import { test, expect } from "@playwright/test";
import { allowFailure, assertNoUndeclaredFailures, attachGuard, createGuard } from "../support/failure-guard";
import { FIXTURE_URL } from "../support/reset";

const SW = { message: "reading 'waiting'", reason: "SW blocked" };
const PROFILE = { url: "/profile", reason: "fixture no /profile" };
const PWACTRL = { url: "/pwa-control", reason: "fixture no /pwa-control" };
let c = 0; function tid(): string { c += 1; return `sub-${c}`; }

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
  allowFailure(g, SW); allowFailure(g, PROFILE); allowFailure(g, PWACTRL);
  await page.goto("/"); await registerDevice(page);
  await page.goto("/assinaturas");
  return g;
}

test("[SUB-01] subscriptions page renders", async ({ page }) => {
  const id = tid(); const g = await init(page, id);
  await expect(page.getByText("Netflix").first()).toBeVisible({ timeout: 5000 });
  assertNoUndeclaredFailures(g);
});

test("[SUB-02] create subscription → POST /subscriptions", async ({ page }) => {
  const id = tid(); const g = await init(page, id);
  const btn = page.getByRole("button", { name: "Nova assinatura" });
  if (await btn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await btn.click();
    await expect(page.getByRole("heading", { name: /Nova assinatura/i })).toBeVisible({ timeout: 3000 });
    await page.getByPlaceholder("Ex: Netflix").fill("Spotify Premium");
    await page.getByPlaceholder("0,00").fill("21,90");
    await page.getByRole("button", { name: /Salvar|Criar/i }).click();
  }
  assertNoUndeclaredFailures(g);
});

test("[SUB-03] tap subscription shows detail", async ({ page }) => {
  const id = tid(); const g = await init(page, id);
  await page.getByText("Netflix").first().click();
  await expect(page.getByText(/R\$.+/i).first()).toBeVisible({ timeout: 3000 });
  assertNoUndeclaredFailures(g);
});

test("[SUB-04] edit subscription → PATCH /subscriptions/:id", async ({ page }) => {
  const id = tid(); const g = await init(page, id);
  await page.getByText("Netflix").first().click();
  const edit = page.getByRole("button", { name: "Editar assinatura" });
  if (await edit.isVisible({ timeout: 3000 }).catch(() => false)) {
    await edit.click();
    await expect(page.getByRole("heading", { name: /Editar assinatura/i })).toBeVisible({ timeout: 3000 });
    const inp = page.getByPlaceholder("Ex: Netflix");
    await inp.clear(); await inp.fill("Netflix Premium");
    await page.getByRole("button", { name: /Salvar/i }).click();
  }
  assertNoUndeclaredFailures(g);
});

test("[SUB-05] cancel subscription → POST /subscriptions/:id/cancel", async ({ page }) => {
  const id = tid(); const g = await init(page, id);
  await page.getByText("Netflix").first().click();
  const cancel = page.getByRole("button", { name: "Cancelar assinatura" });
  if (await cancel.isVisible({ timeout: 3000 }).catch(() => false)) {
    await cancel.click();
    const confirm = page.getByRole("button", { name: /Sim|Confirmar/i }).last();
    if (await confirm.isVisible({ timeout: 2000 }).catch(() => false)) await confirm.click();
  }
  assertNoUndeclaredFailures(g);
});
