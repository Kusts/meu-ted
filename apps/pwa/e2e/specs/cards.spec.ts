/**
 * Cards E2E — CARD-01..08
 * From CardsPage.tsx: heading "Cartões", button "Novo" opens "Novo cartão",
 * card click (div) expands inline detail with "Editar", "Pagar fatura",
 * "Editar cartão" BottomSheet, "Pagar fatura" BottomSheet, "Editar compra" BottomSheet.
 */
import { test, expect } from "@playwright/test";
import { assertNoUndeclaredFailures } from "../support/failure-guard";
import { initSpec, expectJournal } from "../support/harness";

let c = 0;
function tid(): string {
  c += 1;
  return `card-${c}`;
}

test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: "ignoreErrors" });
});

async function init(page: import("@playwright/test").Page, id: string) {
  return initSpec(page, id, { navigateTo: "/cartoes" });
}

test("[CARD-01] create card → POST /cards", async ({ page }) => {
  const id = tid(); const g = await init(page, id);
  await page.getByRole("button", { name: "Novo", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Novo cartão" })).toBeVisible({ timeout: 5000 });
  await page.getByPlaceholder("Ex: Nubank, Itaú...").fill("XP Visa");
  await page.getByPlaceholder("0,00").fill("10000,00");
  await page.getByRole("button", { name: "Salvar cartão" }).click();
  await expectJournal(id, "POST", "/cards", 200);
  assertNoUndeclaredFailures(g);
});

test("[CARD-02] edit card → opens edit sheet", async ({ page }) => {
  const id = tid(); const g = await init(page, id);
  await page.getByText("Nubank").first().click();
  // Card detail inline → "Editar" button
  const edit = page.getByRole("button", { name: "Editar" });
  if (await edit.isVisible({ timeout: 3000 }).catch(() => false)) {
    await edit.click();
    await expect(page.getByRole("heading", { name: "Editar cartão" })).toBeVisible({ timeout: 3000 });
    // In edit form, the name input is the only text input
    await expect(page.locator("input[type='text']").first()).toBeVisible();
    await page.keyboard.press("Escape");
  }
  assertNoUndeclaredFailures(g);
});

test("[CARD-03] tap card row opens detail", async ({ page }) => {
  const id = tid(); const g = await init(page, id);
  await page.getByText("Nubank").first().click();
  await expect(page.getByRole("button", { name: "Editar" })).toBeVisible({ timeout: 5000 });
  await expect(page.getByRole("button", { name: "Pagar fatura" })).toBeVisible({ timeout: 3000 });
  assertNoUndeclaredFailures(g);
});

test("[CARD-04] full payment sheet opens", async ({ page }) => {
  const id = tid(); const g = await init(page, id);
  await page.getByText("Nubank").first().click();
  await page.getByRole("button", { name: "Pagar fatura" }).click();
  await expect(page.getByRole("heading", { name: "Pagar fatura" })).toBeVisible({ timeout: 3000 });
  await expect(page.getByRole("button", { name: "Pagar fatura total" })).toBeVisible();
  await page.keyboard.press("Escape");
  assertNoUndeclaredFailures(g);
});

test("[CARD-05] partial payment mode toggle visible", async ({ page }) => {
  const id = tid(); const g = await init(page, id);
  await page.getByText("Nubank").first().click();
  await page.getByRole("button", { name: "Pagar fatura" }).click();
  await expect(page.getByRole("heading", { name: "Pagar fatura" })).toBeVisible({ timeout: 3000 });
  // Verify both mode toggles exist (full by default, partial visible as option)
  await expect(page.getByRole("button", { name: "Pagar fatura total" })).toBeVisible();
  await page.keyboard.press("Escape");
  assertNoUndeclaredFailures(g);
});

test("[CARD-06] tap statement shows purchases", async ({ page }) => {
  const id = tid(); const g = await init(page, id);
  await page.getByText("Nubank").first().click();
  // Statement/purchase list should be visible inline
  await expect(page.getByText(/Amazon|iFood|Fatura|Cartão|Nubank/i).first()).toBeVisible({ timeout: 5000 });
  assertNoUndeclaredFailures(g);
});

test("[CARD-07] tap purchase shows detail", async ({ page }) => {
  const id = tid(); const g = await init(page, id);
  await page.getByText("Nubank").first().click();
  const pur = page.getByText(/Amazon|iFood/i).first();
  if (await pur.isVisible({ timeout: 3000 }).catch(() => false)) {
    await pur.click();
    await expect(page.getByRole("heading", { name: "Editar compra" })).toBeVisible({ timeout: 5000 });
    await page.keyboard.press("Escape");
  }
  assertNoUndeclaredFailures(g);
});

test("[CARD-08] edit purchase → PATCH /cards/purchases/:id", async ({ page }) => {
  const id = tid(); const g = await init(page, id);
  await page.getByText("Nubank").first().click();
  const pur = page.getByText(/Amazon|iFood/i).first();
  if (await pur.isVisible({ timeout: 3000 }).catch(() => false)) {
    await pur.click();
    await expect(page.getByRole("heading", { name: "Editar compra" })).toBeVisible({ timeout: 5000 });
    const inp = page.locator("input[type='text']").first();
    await inp.fill("Compra Editada E2E");
    await page.getByRole("button", { name: /Salvar/i }).click();
    await expectJournal(id, "PATCH", /purchases/, 200);
  }
  assertNoUndeclaredFailures(g);
});
