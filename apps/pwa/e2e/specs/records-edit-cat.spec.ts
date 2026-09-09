/**
 * Records edit-category E2E test.
 * ID: EDIT-CAT
 *
 * Canonical spec for editing a transaction's TOP-LEVEL category: open the
 * edit sheet, switch to another category, save, and assert persistence
 * (journal PATCH body carries the new categoryId).
 *
 * Honesty note (R2): the edit UI (TransactionEditSheet) models ONLY a
 * single aggregated category select bound to `categoryId` — there is no
 * subcategory picker in the edit flow, the PWA Transaction state has no
 * `subcategoryId` field, and the fixture PATCH ignores it. Subcategory
 * end-to-end (subcategoryId from creation through edit) is a documented
 * follow-up, NOT claimed here. This spec proves top-level category edits
 * stick (no snap-back) and persist.
 *
 * Seed (populated): tx-1 Supermercado, cat-1 (Alimentação), acc-1.
 * Categories: cat-1 Alimentação, cat-2 Transporte, both kind expense.
 * Fixed clock: 2026-07-17T12:00:00.000Z
 */

import { test, expect } from "@playwright/test";
import { assertNoUndeclaredFailures } from "../support/failure-guard";
import {
  prepareSpec,
  authenticate,
  getJournal as getJournalEntries,
  expectJournal as expectJournalEntry,
} from "../support/harness";

let counter = 0;
function tid(): string {
  counter += 1;
  return `edit-cat-${counter}`;
}

async function init(page: import("@playwright/test").Page, id: string) {
  const guard = await prepareSpec(page, id);
  await page.goto("/registros");
  await authenticate(page);
  return guard;
}

test("[EDIT-CAT] edit transaction top-level category persists", async ({ page }) => {
  const id = tid();
  const guard = await init(page, id);

  // Open action sheet for Supermercado
  await page.getByText("Supermercado").click();
  await expect(page.getByRole("button", { name: "Editar" })).toBeVisible();

  // Open edit sheet
  await page.getByRole("button", { name: "Editar" }).click();
  await expect(page.getByText("Editar lançamento")).toBeVisible({ timeout: 10000 });

  // Category select starts at cat-1 (Alimentação)
  const categorySelect = page.locator("#te-categoria");
  await expect(categorySelect).toBeVisible();
  await expect(categorySelect).toHaveValue("cat-1");

  // Switch to the top-level category cat-2 (Transporte)
  await categorySelect.selectOption("cat-2");

  // The edited value must stick (regression: the sheet used to snap back
  // to the original value ~500ms after any edit).
  await expect(categorySelect).toHaveValue("cat-2");

  // Save
  await page.getByRole("button", { name: "Salvar" }).click();

  // Sheet closes after save
  await expect(page.getByText("Editar lançamento")).not.toBeVisible({ timeout: 10000 });

  // PATCH confirmed via journal
  await expectJournalEntry(id, "PATCH", "/transactions/tx-1", 200);

  // Persistence: the PATCH body must carry the NEW top-level category
  await expect
    .poll(async () => {
      const entries = await getJournalEntries(id);
      return entries.filter(
        (e) => e.method === "PATCH" && e.path === "/transactions/tx-1" && e.status === 200,
      );
    })
    .not.toHaveLength(0);

  const entries = await getJournalEntries(id);
  const patch = entries
    .filter((e) => e.method === "PATCH" && e.path === "/transactions/tx-1" && e.status === 200)
    .at(-1);
  expect(patch).toBeDefined();
  expect(patch!.body).toMatchObject({ categoryId: "cat-2" });

  assertNoUndeclaredFailures(guard);
});
