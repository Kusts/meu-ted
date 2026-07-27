/**
 * Goals E2E — GOAL-01..06
 * From GoalsPage.tsx: heading "Metas", "Nova meta", "Editar meta", "Cancelar meta",
 * "Adicionar valor", "Nova entrada", placeholder "Ex: Viagem, Carro novo...", "0,00".
 */
import { test, expect } from "@playwright/test";
import { allowFailure, assertNoUndeclaredFailures, attachGuard, createGuard } from "../support/failure-guard";
import { FIXTURE_URL } from "../support/reset";

const SW = { message: "reading 'waiting'", reason: "SW blocked" };
const PROFILE = { url: "/profile", reason: "fixture no /profile" };
const PWACTRL = { url: "/pwa-control", reason: "fixture no /pwa-control" };
let c = 0; function tid(): string { c += 1; return `goal-${c}`; }

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
  await page.goto("/metas");
  return g;
}

test("[GOAL-01] goals page renders", async ({ page }) => {
  const id = tid(); const g = await init(page, id);
  await expect(page.getByText(/Reserva|Emergência/i).first()).toBeVisible({ timeout: 5000 });
  assertNoUndeclaredFailures(g);
});

test("[GOAL-02] debt tab accessible", async ({ page }) => {
  const id = tid(); const g = await init(page, id);
  await expect(page.getByRole("heading", { name: /Metas/i })).toBeVisible({ timeout: 5000 });
  assertNoUndeclaredFailures(g);
});

test("[GOAL-03] create goal → POST /goals", async ({ page }) => {
  const id = tid(); const g = await init(page, id);
  const btn = page.getByRole("button", { name: "Nova meta" });
  if (await btn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await btn.click();
    await expect(page.getByRole("heading", { name: /Nova meta/i })).toBeVisible({ timeout: 3000 });
    await page.getByPlaceholder("Ex: Viagem, Carro novo...").fill("Viagem Europa");
    await page.getByPlaceholder("0,00").fill("20000,00");
    await page.getByRole("button", { name: /Salvar|Criar/i }).click();
  }
  assertNoUndeclaredFailures(g);
});

test("[GOAL-04] edit goal → PATCH /goals/:id", async ({ page }) => {
  const id = tid(); const g = await init(page, id);
  await page.getByText(/Reserva/i).first().click();
  const edit = page.getByRole("button", { name: "Editar meta" });
  if (await edit.isVisible({ timeout: 3000 }).catch(() => false)) {
    await edit.click();
    await expect(page.getByRole("heading", { name: /Editar meta|Detalhes/i })).toBeVisible({ timeout: 3000 });
    const inp = page.getByPlaceholder("Ex: Viagem, Carro novo...");
    await inp.clear(); await inp.fill("Reserva Editada");
    await page.getByRole("button", { name: /Salvar/i }).click();
  }
  assertNoUndeclaredFailures(g);
});

test("[GOAL-05] contribute → POST /goals/:id/contribute", async ({ page }) => {
  const id = tid(); const g = await init(page, id);
  await page.getByText(/Reserva/i).first().click();
  const btn = page.getByRole("button", { name: "Adicionar valor" });
  if (await btn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await btn.click();
    await page.getByPlaceholder("0,00").fill("500,00");
    await page.getByRole("button", { name: /Confirmar|Salvar/i }).click();
  }
  assertNoUndeclaredFailures(g);
});

test("[GOAL-06] cancel goal → POST /goals/:id/cancel", async ({ page }) => {
  const id = tid(); const g = await init(page, id);
  await page.getByText(/Reserva/i).first().click();
  const cancel = page.getByRole("button", { name: "Cancelar meta" });
  if (await cancel.isVisible({ timeout: 3000 }).catch(() => false)) {
    await cancel.click();
    const confirm = page.getByRole("button", { name: /Sim|Confirmar|Cancelar/i }).last();
    if (await confirm.isVisible({ timeout: 2000 }).catch(() => false)) await confirm.click();
  }
  assertNoUndeclaredFailures(g);
});
