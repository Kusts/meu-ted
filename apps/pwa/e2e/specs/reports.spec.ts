/**
 * Reports page E2E tests — REP-01..04
 *
 * Matrix:
 * REP-01 month chip → month aggregation
 * REP-02 last-period chip → last-month aggregation
 * REP-03 quarter chip → quarter aggregation
 * REP-04 year chip → year aggregation
 *
 * Fixed clock 2026-07-17. Seed txs: 2026-07-10 Supermercado R$150 + 2026-07-11 Uber R$25.
 * - Mês / Trim. / Ano → expenses R$ 175,00 (July activity)
 * - Mês passado → June empty → R$ 0,00
 */

import { test, expect } from "@playwright/test";
import { assertNoUndeclaredFailures } from "../support/failure-guard";
import { prepareSpec, authenticate } from "../support/harness";


let counter = 0;
function tid(): string {
  counter += 1;
  return `rep-${counter}`;
}


test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: "ignoreErrors" });
});



async function init(page: import("@playwright/test").Page, id: string) {
  // Deep-links into /hub/relatorios before registering — order preserved.
  const guard = await prepareSpec(page, id, {
    baselineAllows: false,
    allow: [{ message: "reading 'waiting'", reason: "SW blocked" }],
  });
  await page.goto("/hub/relatorios");
  await authenticate(page);
  await expect(page.getByRole("heading", { name: "Relatórios" })).toBeVisible({
    timeout: 10000,
  });
  return guard;
}

/** Period subtitle under the chip row (capitalized month/quarter/year label). */
function periodSubtitle(page: import("@playwright/test").Page) {
  return page.locator("main span.capitalize").first();
}

/** Hero net result under "Resultado do período". */
function periodResult(page: import("@playwright/test").Page) {
  return page
    .locator("main")
    .getByText("Resultado do período")
    .locator("..")
    .locator(".font-mono")
    .first();
}

function periodExpense(page: import("@playwright/test").Page) {
  return page
    .locator("main")
    .getByText("Resultado do período")
    .locator("..")
    .getByText("Despesas")
    .locator("..")
    .locator(".font-mono")
    .first();
}

// ── REP-01 ─────────────────────────────────────────────────────────────────

test("[REP-01] tap month period chip → chart updates to month aggregation", async ({
  page,
}) => {
  const id = tid();
  const guard = await init(page, id);

  // Switch away first so month click is a real change
  await page.getByRole("button", { name: "Ano" }).click();
  await expect(periodSubtitle(page)).toHaveText("2026");

  await page.getByRole("button", { name: "Mês", exact: true }).click();
  await expect(periodSubtitle(page)).toHaveText(/julho de 2026/i);
  // July seed expenses: 15000+2500 = R$ 175,00
  await expect(periodExpense(page)).toHaveText(/175,00/);
  await expect(periodResult(page)).toHaveText(/175,00/);
  assertNoUndeclaredFailures(guard);
});

// ── REP-02 ─────────────────────────────────────────────────────────────────

test("[REP-02] tap last period chip → chart updates to last-month aggregation", async ({
  page,
}) => {
  const id = tid();
  const guard = await init(page, id);

  // Default is month with July activity
  await expect(periodSubtitle(page)).toHaveText(/julho de 2026/i);
  await expect(periodExpense(page)).toHaveText(/175,00/);

  await page.getByRole("button", { name: "Mês passado" }).click();
  await expect(periodSubtitle(page)).toHaveText(/junho de 2026/i);
  // No June seed txs → zero aggregation
  await expect(periodExpense(page)).toHaveText(/R\$\s*0,00/);
  await expect(periodResult(page)).toHaveText(/R\$\s*0,00/);
  assertNoUndeclaredFailures(guard);
});

// ── REP-03 ─────────────────────────────────────────────────────────────────

test("[REP-03] tap quarter period chip → chart updates to quarter aggregation", async ({
  page,
}) => {
  const id = tid();
  const guard = await init(page, id);

  await page.getByRole("button", { name: "Mês passado" }).click();
  await expect(periodSubtitle(page)).toHaveText(/junho de 2026/i);

  await page.getByRole("button", { name: "Trim." }).click();
  // July 2026 → 3º trimestre; July txs included
  await expect(periodSubtitle(page)).toHaveText(/3º trimestre de 2026/i);
  await expect(periodExpense(page)).toHaveText(/175,00/);
  assertNoUndeclaredFailures(guard);
});

// ── REP-04 ─────────────────────────────────────────────────────────────────

test("[REP-04] tap year period chip → chart updates to year aggregation", async ({
  page,
}) => {
  const id = tid();
  const guard = await init(page, id);

  await page.getByRole("button", { name: "Mês passado" }).click();
  await expect(periodExpense(page)).toHaveText(/R\$\s*0,00/);

  await page.getByRole("button", { name: "Ano" }).click();
  await expect(periodSubtitle(page)).toHaveText("2026");
  // Full-year includes July seed expenses
  await expect(periodExpense(page)).toHaveText(/175,00/);
  await expect(periodResult(page)).toHaveText(/175,00/);
  assertNoUndeclaredFailures(guard);
});
