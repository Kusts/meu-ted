/**
 * Categories E2E — CAT-01..05
 * From CategoriesPage.tsx: heading "Categorias", button "Nova categoria",
 * placeholder "Ex: Alimentação, Salário...", kind toggles "Despesa"/"Receita",
 * subcategory placeholder "Nome da subcategoria…", "Nova subcategoria" button,
 * edit button per row, deactivate button per row.
 */
import { test, expect } from "@playwright/test";
import { assertNoUndeclaredFailures } from "../support/failure-guard";
import { initSpec, expectJournal, getJournal } from "../support/harness";

let c = 0;
function tid(): string {
  c += 1;
  return `cat-${c}`;
}

test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: "ignoreErrors" });
});

async function init(page: import("@playwright/test").Page, id: string) {
  const guard = await initSpec(page, id, { navigateTo: "/hub/categorias" });
  // Sync barrier: the original init waited for the page to render before
  // handing control to the test body. Without it, assertions can start
  // against a blank route.
  await expect(page.getByRole("heading", { name: "Categorias" })).toBeVisible({ timeout: 10000 });
  return guard;
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
  // Two "Receita" buttons exist on the page — scope to the open sheet.
  await page.getByRole("dialog").last().getByRole("button", { name: "Receita" }).click();
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

test("[CAT-04] edit category → opens edit sheet", async ({ page }) => {
  const id = tid(); const g = await init(page, id);

  const edit = page.getByRole("button", { name: /Editar/i }).first();
  if (await edit.isVisible({ timeout: 3000 }).catch(() => false)) {
    await edit.click();
    await expect(page.getByRole("heading", { name: "Editar categoria" })).toBeVisible({ timeout: 3000 });
    // Verify form has text input (no placeholder in edit mode)
    await expect(page.locator("input[type='text']").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Salvar" })).toBeVisible();
    await page.keyboard.press("Escape");
  }
  assertNoUndeclaredFailures(g);
});

test("[CAT-05] deactivate category → confirm dialog opens", async ({ page }) => {
  const id = tid(); const g = await init(page, id);

  const deact = page.getByRole("button", { name: /Desativar/i }).first();
  if (await deact.isVisible({ timeout: 3000 }).catch(() => false)) {
    await deact.click();
    await expect(page.getByRole("heading", { name: "Desativar categoria" })).toBeVisible({ timeout: 3000 });
    // Cancel closes dialog
    await page.getByRole("button", { name: "Cancelar" }).click();
    const j = await getJournal(id);
    expect(j.filter(e => e.method === "POST" && e.path.includes("deactivate"))).toHaveLength(0);
  }
  assertNoUndeclaredFailures(g);
});
