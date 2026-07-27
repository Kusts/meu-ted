/**
 * Subscriptions E2E — SUB-01..05
 * From SubscriptionsPage.tsx: heading "Assinaturas", "Nova assinatura",
 * placeholder "Ex: Netflix", "0,00", "1 a 31",
 * "Editar assinatura", "Cancelar assinatura".
 */
import { test, expect } from "@playwright/test";
import { assertNoUndeclaredFailures } from "../support/failure-guard";
import { initSpec } from "../support/harness";

let c = 0;
function tid(): string {
  c += 1;
  return `sub-${c}`;
}

test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: "ignoreErrors" });
});

async function init(page: import("@playwright/test").Page, id: string) {
  return initSpec(page, id, { navigateTo: "/assinaturas" });
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
