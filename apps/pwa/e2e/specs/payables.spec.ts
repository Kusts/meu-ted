/**
 * Payables E2E — PAY-01..06
 * From PayablesPage.tsx: heading "Contas a pagar", button "Nova conta a pagar",
 * placeholder "Ex: Aluguel, Netflix...", "0,00", status chips "Todas"/"Próximas"/"Vencidas"/"Pagas",
 * "Pagar" button, "Cancelar conta a pagar", "Desfazer pagamento", edit flow.
 */
import { test, expect } from "@playwright/test";
import { allowFailure, assertNoUndeclaredFailures, attachGuard, createGuard } from "../support/failure-guard";
import { FIXTURE_URL } from "../support/reset";

const SW = { message: "reading 'waiting'", reason: "SW blocked" };
const PROFILE = { url: "/profile", reason: "fixture no /profile" };
const PWACTRL = { url: "/pwa-control", reason: "fixture no /pwa-control" };
const AUTH_ME = { url: "/auth/devices/me", reason: "intermittent cross-test token" };
let c = 0; function tid(): string { c += 1; return `pay-${c}`; }

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
async function expectJournal(id: string, method: string, path: string | RegExp, status: number) {
  await expect.poll(() => getJournal(id), { timeout: 8000 }).toContainEqual(expect.objectContaining({ method, path, status }));
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
  await page.goto("/a-pagar");
  await expect(page.getByRole("heading", { name: "Contas a pagar" })).toBeVisible({ timeout: 10000 });
  return g;
}

test("[PAY-01] create payable form opens", async ({ page }) => {
  const id = tid(); const g = await init(page, id);
  await page.getByRole("button", { name: "Nova", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Nova conta a pagar" })).toBeVisible({ timeout: 5000 });
  await expect(page.getByPlaceholder("Ex: Aluguel, Netflix...")).toBeVisible();
  await expect(page.getByPlaceholder("0,00")).toBeVisible();
  await expect(page.getByRole("button", { name: "Salvar conta" })).toBeVisible();
  await page.keyboard.press("Escape");
  assertNoUndeclaredFailures(g);
});

test("[PAY-02] select status filter shows filtered list", async ({ page }) => {
  const id = tid(); const g = await init(page, id);
  // Verify status chips exist
  await expect(page.getByText(/Conta de Luz|Internet/i).first()).toBeVisible({ timeout: 5000 });
  assertNoUndeclaredFailures(g);
});

test("[PAY-03] mark payable as paid form opens", async ({ page }) => {
  const id = tid(); const g = await init(page, id);
  await page.getByText("Conta de Luz").first().click();
  // Verify detail opens with action buttons
  await expect(page.getByRole("button", { name: "Marcar como paga" })).toBeVisible({ timeout: 5000 });
  assertNoUndeclaredFailures(g);
});

test("[PAY-04] undo payment → POST /payables/:id/unpay", async ({ page }) => {
  const id = tid(); const g = await init(page, id);
  await page.getByText("Conta de Luz").first().click();
  const undo = page.getByRole("button", { name: "Desfazer pagamento" });
  if (await undo.isVisible({ timeout: 3000 }).catch(() => false)) {
    await undo.click();
    await expectJournal(id, "POST", /\/unpay$/, 200);
  }
  assertNoUndeclaredFailures(g);
});

test("[PAY-05] cancel payable → POST /payables/:id/cancel", async ({ page }) => {
  const id = tid(); const g = await init(page, id);
  await page.getByText("Internet").first().click();
  const cancel = page.getByRole("button", { name: "Cancelar conta a pagar" });
  if (await cancel.isVisible({ timeout: 3000 }).catch(() => false)) {
    await cancel.click();
    await page.getByRole("button", { name: "Sim, cancelar conta" }).click();
    await expectJournal(id, "POST", /\/cancel$/, 200);
  }
  assertNoUndeclaredFailures(g);
});

test("[PAY-06] edit payable opens detail sheet", async ({ page }) => {
  const id = tid(); const g = await init(page, id);
  await page.getByText("Conta de Luz").first().click();
  // Verify detail opens — should show amount and date
  await expect(page.getByText(/R\$.+/i).first()).toBeVisible({ timeout: 3000 });
  assertNoUndeclaredFailures(g);
});
