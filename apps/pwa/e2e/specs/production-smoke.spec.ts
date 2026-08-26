/**
 * Production smoke E2E tests — SMOKE-01..04
 *
 * Opt-in only (E2E_PRODUCTION_SMOKE=1). Validates unauthenticated
 * registration shell across key routes without any fixture/API.
 * Never touches authenticated content or writes.
 *
 * Matrix:
 * SMOKE-01 direct load / → registration shell renders
 * SMOKE-02 direct load /registros → registration shell renders
 * SMOKE-03 direct load /contas → registration shell renders
 * SMOKE-04 direct load /cartoes → registration shell renders
 */

import { test, expect, type Page } from "@playwright/test";

// Only run when opt-in env var is set
const SMOKE = process.env.E2E_PRODUCTION_SMOKE === "1";
const READ_ONLY_METHODS = ["GET", "HEAD", "OPTIONS"];

async function gotoReadOnly(page: Page, path: string) {
  const writes: string[] = [];
  page.on("request", (req) => {
    if (!READ_ONLY_METHODS.includes(req.method())) {
      writes.push(`${req.method()} ${req.url()}`);
    }
  });
  await page.goto(path);
  if (writes.length > 0) {
    throw new Error(`production smoke emitted writes: ${writes.join(", ")}`);
  }
}

test.describe("production-smoke", () => {
  test.skip(!SMOKE, "Opt-in only — set E2E_PRODUCTION_SMOKE=1 to run");

  test("[SMOKE-01] direct load / shows registration shell, no authenticated content", async ({ page }) => {
    await gotoReadOnly(page, "/");
    // Assert registration shell is visible
    await expect(page.getByRole("button", { name: /Registrar|Entrar/i })).toBeVisible({ timeout: 15000 });
    // Assert no authenticated elements leak through
    await expect(page.getByLabel("Nova transação")).toBeHidden();
    await expect(page.getByRole("heading", { name: /Resumo|Dashboard/i })).toBeHidden();
  });

  test("[SMOKE-02] direct load /registros shows registration shell", async ({ page }) => {
    await gotoReadOnly(page, "/registros");
    await expect(page.getByRole("button", { name: /Registrar|Entrar/i })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole("heading", { name: /Registros/i })).toBeHidden();
  });

  test("[SMOKE-03] direct load /contas shows registration shell", async ({ page }) => {
    await gotoReadOnly(page, "/contas");
    await expect(page.getByRole("button", { name: /Registrar|Entrar/i })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole("heading", { name: /Contas/i })).toBeHidden();
  });

  test("[SMOKE-04] direct load /cartoes shows registration shell", async ({ page }) => {
    await gotoReadOnly(page, "/cartoes");
    await expect(page.getByRole("button", { name: /Registrar|Entrar/i })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole("heading", { name: /Cartões/i })).toBeHidden();
  });
});
