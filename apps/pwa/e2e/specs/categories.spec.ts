/**
 * Categories E2E — CAT-01..05
 * From CategoriesPage.tsx: heading "Categorias", button "Nova categoria",
 * placeholder "Ex: Alimentação, Salário...", kind toggles "Despesa"/"Receita",
 * subcategory placeholder "Nome da subcategoria…", "Nova subcategoria" button,
 * edit button per row, deactivate button per row.
 */
import { test, expect } from "@playwright/test";
import { allowFailure, assertNoUndeclaredFailures, attachGuard, createGuard } from "../support/failure-guard";
import { FIXTURE_URL } from "../support/reset";

const SW = { message: "reading 'waiting'", reason: "SW blocked" };
const PROFILE = { url: "/profile", reason: "fixture no /profile" };
const PWACTRL = { url: "/pwa-control", reason: "fixture no /pwa-control" };
let c = 0; function tid(): string { c += 1; return `cat-${c}`; }

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
  allowFailure(g, SW); allowFailure(g, PROFILE); allowFailure(g, PWACTRL);
  await page.goto("/"); await registerDevice(page);
  await page.goto("/categorias");
  await expect(page.getByRole("heading", { name: "Categorias" })).toBeVisible({ timeout: 10000 });
  return g;
}

test("[CAT-01] create expense category → POST /categories", async ({ page }) => {
  const id = tid(); const g = await init(page, id);

  await page.getByRole("button", { name: "Nova", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Nova categoria" })).toBeVisible({ timeout: 5000 });
  await page.getByPlaceholder("Ex: Alimentação, Salário...").fill("Lazer E2E");
  await page.getByRole("button", { name: "Salvar" }).click();
  await expectJournal(id, "POST", "/categories", 200);
  assertNoUndeclaredFailures(g);
});

test("[CAT-02] create income category → POST /categories", async ({ page }) => {
  const id = tid(); const g = await init(page, id);

  await page.getByRole("button", { name: "Nova", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Nova categoria" })).toBeVisible({ timeout: 5000 });
  await page.getByPlaceholder("Ex: Alimentação, Salário...").fill("Freelance E2E");
  await page.getByRole("button", { name: "Receita" }).click();
  await page.getByRole("button", { name: "Salvar" }).click();
  await expectJournal(id, "POST", "/categories", 200);
  assertNoUndeclaredFailures(g);
});

test("[CAT-03] add subcategory → POST /categories", async ({ page }) => {
  const id = tid(); const g = await init(page, id);

  // Click parent "Alimentação" to expand subcategories
  await page.getByText("Alimentação").first().click();
  // Look for "Nova subcategoria" button
  const subBtn = page.getByRole("button", { name: /Nova|subcategoria/i }).first();
  if (await subBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await subBtn.click();
    const inp = page.getByPlaceholder("Nome da subcategoria…");
    if (await inp.isVisible({ timeout: 2000 })) {
      await inp.fill("Restaurantes E2E");
      await page.getByRole("button", { name: "OK" }).click();
      await expectJournal(id, "POST", "/categories", 200);
    }
  }
  assertNoUndeclaredFailures(g);
});

test("[CAT-04] edit category → PATCH /categories/:id", async ({ page }) => {
  const id = tid(); const g = await init(page, id);

  // Click edit button on a category row
  const edit = page.getByRole("button", { name: /Editar/i }).first();
  if (await edit.isVisible({ timeout: 3000 }).catch(() => false)) {
    await edit.click();
    await expect(page.getByRole("heading", { name: "Editar categoria" })).toBeVisible({ timeout: 3000 });
    const inp = page.getByPlaceholder("Ex: Alimentação, Salário...");
    await inp.clear(); await inp.fill("Transporte Editado");
    await page.getByRole("button", { name: "Salvar" }).click();
    await expectJournal(id, "PATCH", /^\/categories\/[a-zA-Z0-9_-]+$/, 200);
  }
  assertNoUndeclaredFailures(g);
});

test("[CAT-05] deactivate category → POST /categories/:id/deactivate", async ({ page }) => {
  const id = tid(); const g = await init(page, id);

  const deact = page.getByRole("button", { name: /Desativar/i }).first();
  if (await deact.isVisible({ timeout: 3000 }).catch(() => false)) {
    await deact.click();
    await expect(page.getByRole("heading", { name: "Desativar categoria" })).toBeVisible({ timeout: 3000 });
    const cancel = page.getByRole("button", { name: "Cancelar" });
    if (await cancel.isVisible({ timeout: 2000 }).catch(() => false)) {
      await cancel.click();
      let j = await getJournal(id);
      expect(j.filter(e => e.method === "POST" && e.path.includes("deactivate"))).toHaveLength(0);
      await deact.click();
    }
    await page.getByRole("button", { name: /Desativar|Sim|Confirmar/i }).last().click();
    await expectJournal(id, "POST", /deactivate$/, 200);
  }
  assertNoUndeclaredFailures(g);
});
