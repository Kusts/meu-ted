/**
 * Accounts E2E — ACC-01..06
 *
 * Pages structure:
 *   1. /contas → list of accounts. Button "Nova" opens BottomSheet "Nova conta".
 *   2. Click account row → BottomSheet "Detalhes da conta" with "Editar conta" / "Desativar conta"
 *   3. Click "Editar conta" → BottomSheet "Editar conta" with name input (no placeholder) + "Salvar"
 *   4. Click "Desativar conta" → confirm BottomSheet
 */
import { test, expect } from "@playwright/test";
import { allowFailure, assertNoUndeclaredFailures, attachGuard, createGuard } from "../support/failure-guard";
import { FIXTURE_URL } from "../support/reset";

const SW = { message: "reading 'waiting'", reason: "SW blocked" };
const PROFILE = { url: "/profile", reason: "fixture no /profile" };
const PWACTRL = { url: "/pwa-control", reason: "fixture no /pwa-control" };
const AUTH_ME = { url: "/auth/devices/me", reason: "intermittent cross-test token" };
let c = 0; function tid(): string { c += 1; return `acc-${c}`; }

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
async function init(page: import("@playwright/test").Page, id: string, nav = "/contas") {
  const g = createGuard(); attachGuard(page, g); await allowCsp(page); await resetFixture(id);
  await page.clock.setFixedTime("2026-07-17T12:00:00.000Z");
  await page.context().setExtraHTTPHeaders({ "x-e2e-test-id": id });
  allowFailure(g, SW); allowFailure(g, PROFILE); allowFailure(g, PWACTRL); allowFailure(g, AUTH_ME);
  await page.goto("/"); await registerDevice(page);
  await page.goto(nav);
  return g;
}

// ── ACC-01 ──────────────────────────────────────────────────────────────────

test("[ACC-01] create bank account → POST /accounts", async ({ page }) => {
  const id = tid(); const g = await init(page, id);

  await page.getByRole("button", { name: "Nova", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Nova conta" })).toBeVisible({ timeout: 5000 });

  // Cancel via Escape
  await page.keyboard.press("Escape");
  let j = await getJournal(id);
  expect(j.filter(e => e.method === "POST" && e.path === "/accounts")).toHaveLength(0);

  // Reopen, fill, save
  await page.getByRole("button", { name: "Nova", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Nova conta" })).toBeVisible({ timeout: 5000 });
  await page.getByPlaceholder("Ex: Nubank, Itaú...").fill("Itaú Principal");
  await page.getByPlaceholder("0,00").fill("1000,00");
  await page.getByRole("button", { name: "Salvar" }).click();
  await expectJournal(id, "POST", "/accounts", 200);
  assertNoUndeclaredFailures(g);
});

// ── ACC-02 ──────────────────────────────────────────────────────────────────

test("[ACC-02] create cash account → POST /accounts", async ({ page }) => {
  const id = tid(); const g = await init(page, id);

  await page.getByRole("button", { name: "Nova", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Nova conta" })).toBeVisible({ timeout: 5000 });
  await page.getByPlaceholder("Ex: Nubank, Itaú...").fill("Caixa E2E");
  await page.getByPlaceholder("0,00").fill("50,00");
  await page.getByRole("button", { name: "Salvar" }).click();
  await expectJournal(id, "POST", "/accounts", 200);
  assertNoUndeclaredFailures(g);
});

// ── ACC-03 ──────────────────────────────────────────────────────────────────

test("[ACC-03] create card → POST /cards", async ({ page }) => {
  const id = tid(); const g = await init(page, id);
  await page.goto("/cartoes");
  await expect(page.getByText("Nubank")).toBeVisible({ timeout: 10000 });

  await page.getByRole("button", { name: "Novo", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Novo cartão" })).toBeVisible({ timeout: 5000 });
  await page.keyboard.press("Escape");
  let j = await getJournal(id);
  expect(j.filter(e => e.method === "POST" && e.path === "/cards")).toHaveLength(0);

  await page.getByRole("button", { name: "Novo", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Novo cartão" })).toBeVisible({ timeout: 5000 });
  await page.getByPlaceholder("Ex: Nubank, Itaú...").fill("Inter Platinum");
  await page.getByPlaceholder("0,00").fill("3000,00");
  await page.getByRole("button", { name: "Salvar cartão" }).click();
  await expectJournal(id, "POST", "/cards", 200);
  assertNoUndeclaredFailures(g);
});

// ── ACC-04 ──────────────────────────────────────────────────────────────────

test("[ACC-04] edit account detail sheet opens", async ({ page }) => {
  const id = tid(); const g = await init(page, id);

  // Tap "Conta Corrente" → opens AccountDetailSheet "Detalhes da conta"
  await page.getByRole("button", { name: /Conta Corrente/i }).first().click();
  await expect(page.getByRole("heading", { name: "Detalhes da conta" })).toBeVisible({ timeout: 5000 });

  // "Editar conta" button exists
  await expect(page.getByRole("button", { name: "Editar conta" })).toBeVisible();

  // Click edit → opens edit BottomSheet
  await page.getByRole("button", { name: "Editar conta" }).click();
  await expect(page.getByRole("heading", { name: "Editar conta" })).toBeVisible({ timeout: 3000 });

  // Verify save button exists (PATCH tested via unit tests)
  await expect(page.getByRole("button", { name: "Salvar", exact: true })).toBeVisible();
  // Close the sheet
  await page.keyboard.press("Escape");

  assertNoUndeclaredFailures(g);
});

// ── ACC-05 ──────────────────────────────────────────────────────────────────

test("[ACC-05] edit card detail opens inline", async ({ page }) => {
  const id = tid(); const g = await init(page, id);
  await page.goto("/cartoes");
  await expect(page.getByText("Nubank")).toBeVisible({ timeout: 10000 });

  // Tap Nubank card (clickable div, not button)
  await page.getByText("Nubank").first().click();
  // Detail expands inline — verify action buttons appear
  await expect(page.getByRole("button", { name: "Editar" })).toBeVisible({ timeout: 5000 });
  await expect(page.getByRole("button", { name: "Pagar fatura" })).toBeVisible({ timeout: 3000 });

  assertNoUndeclaredFailures(g);
});

// ── ACC-06 ──────────────────────────────────────────────────────────────────

test("[ACC-06] deactivate account confirm dialog opens", async ({ page }) => {
  const id = tid(); const g = await init(page, id);

  await page.getByRole("button", { name: /Conta Corrente/i }).first().click();
  await expect(page.getByRole("heading", { name: "Detalhes da conta" })).toBeVisible({ timeout: 5000 });

  // Click "Desativar conta" → ConfirmActionDialog (h3)
  await page.getByRole("button", { name: "Desativar conta" }).click();
  await expect(page.getByRole("heading", { name: "Desativar conta" })).toBeVisible({ timeout: 3000 });

  // Verify dialog buttons
  await expect(page.getByRole("button", { name: "Cancelar" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Desativar" })).toBeVisible();

  // Cancel closes dialog, no API call
  await page.getByRole("button", { name: "Cancelar" }).click();
  let j = await getJournal(id);
  expect(j.filter(e => e.method === "POST" && e.path.includes("deactivate"))).toHaveLength(0);

  assertNoUndeclaredFailures(g);
});
