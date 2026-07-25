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
import {
  allowFailure,
  assertNoUndeclaredFailures,
  attachGuard,
  createGuard,
} from "../support/failure-guard";
import { FIXTURE_URL } from "../support/reset";

const FIXED_CLOCK = "2026-07-17T12:00:00.000Z";
const SW = { message: "reading 'waiting'", reason: "SW blocked" };

let counter = 0;
function tid(): string {
  counter += 1;
  return `rep-${counter}`;
}

async function allowFixtureCsp(page: import("@playwright/test").Page): Promise<void> {
  await page.route("**/*", async (route) => {
    try {
      const response = await route.fetch();
      const headers = { ...response.headers() };
      const csp = headers["content-security-policy"];
      if (csp) {
        headers["content-security-policy"] = csp
          .replace(/connect-src\s+([^;]+)/, "connect-src http://127.0.0.1:4010 $1")
          .replace(/script-src\s+([^;]+)/, "script-src 'unsafe-eval' $1");
      }
      await route.fulfill({ response, headers });
    } catch {
      // teardown race
    }
  });
}

test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: "ignoreErrors" });
});

async function resetFixture(testId: string, seed = "populated"): Promise<void> {
  const res = await fetch(`${FIXTURE_URL}/__e2e/reset`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-e2e-test-id": testId },
    body: JSON.stringify({ testId, seed }),
  });
  if (!res.ok) throw new Error(`Fixture reset failed: ${res.status}`);
}

async function registerDevice(page: import("@playwright/test").Page): Promise<void> {
  const registerButton = page.getByRole("button", { name: "Registrar" });
  await expect(registerButton).toBeVisible({ timeout: 15000 });
  await registerButton.click();
  await expect(page.getByLabel("Nova transação")).toBeVisible({ timeout: 15000 });
}

async function init(page: import("@playwright/test").Page, id: string) {
  const guard = createGuard();
  attachGuard(page, guard);
  await allowFixtureCsp(page);
  await resetFixture(id);
  await page.clock.setFixedTime(FIXED_CLOCK);
  await page.context().setExtraHTTPHeaders({ "x-e2e-test-id": id });
  allowFailure(guard, SW);
  await page.goto("/relatorios");
  await registerDevice(page);
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
