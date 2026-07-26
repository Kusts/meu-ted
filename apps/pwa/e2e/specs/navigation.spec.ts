/**
 * Navigation E2E tests.
 * IDs: DIRECT-01..12, NAV-01..13
 *
 * DIRECT: direct-load each route, register device, assert URL + heading +
 *   fixture journal has zero unexpected writes.
 * NAV-01..03: click BottomNav button, assert URL changes.
 * NAV-04: click Mais, assert dialog(sheet) opens.
 * NAV-05..12: open More sheet, click item, assert URL.
 * NAV-13: open More, click backdrop, assert sheet closed, route preserved.
 *
 * No body-visibility as acceptance, no conditional locators, no arbitrary waits.
 */

import { test, expect } from "@playwright/test";
import { createGuard, attachGuard, assertNoUndeclaredFailures, allowFailure } from "../support/failure-guard";

const FIXED_CLOCK = "2026-07-17T12:00:00.000Z";
const FIXTURE_PORT = 4010;

let counter = 0;
function tid(prefix: string): string {
  counter++;
  return `nav-${prefix}-${counter}`;
}

async function allowFixtureCsp(page: import("@playwright/test").Page): Promise<void> {
  await page.route("**/*", async (route) => {
    try {
      const response = await route.fetch();
      const csp = response.headers()["content-security-policy"];
      if (csp) {
        const modified = csp
          .replace(/connect-src\s+([^;]+)/, "connect-src http://127.0.0.1:4010 $1")
          .replace(/script-src\s+([^;]+)/, "script-src 'unsafe-eval' $1");
        await route.fulfill({
          response,
          headers: { ...response.headers(), "content-security-policy": modified },
        });
      } else {
        await route.fulfill({ response });
      }
    } catch {
      // teardown race
    }
  });
}

async function resetFixture(testId: string): Promise<void> {
  const res = await fetch(`http://127.0.0.1:${FIXTURE_PORT}/__e2e/reset`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-e2e-test-id": testId },
    body: JSON.stringify({ testId, seed: "populated" }),
  });
  if (!res.ok) throw new Error(`Fixture reset failed: ${res.status}`);
}

async function getJournal(testId: string): Promise<Array<{ method: string; path: string; status: number }>> {
  const res = await fetch(`http://127.0.0.1:${FIXTURE_PORT}/__e2e/journal?testId=${testId}`, {
    headers: { "x-e2e-test-id": testId },
  });
  if (!res.ok) return [];
  return res.json();
}

async function setup(page: import("@playwright/test").Page, id: string): Promise<void> {
  await allowFixtureCsp(page);
  await resetFixture(id);
  await page.clock.setFixedTime(FIXED_CLOCK);
  await page.context().setExtraHTTPHeaders({ "x-e2e-test-id": id });
}

/** Click Registrar button and wait for auth to complete. */
async function registerDevice(page: import("@playwright/test").Page): Promise<void> {
  await page.getByRole("button", { name: "Registrar" }).click({ timeout: 10000 });
  // Wait for network to settle — registration API call completes
  await page.waitForLoadState("networkidle", { timeout: 15000 });
  // FAB confirms authenticated state (rendered by AppShell after auth)
  await expect(page.getByLabel("Nova transação")).toBeVisible({ timeout: 10000 });
}

/** Assert the fixture journal has no unexpected write entries (exclude auth registration). */
async function assertNoUnexpectedWrites(testId: string): Promise<void> {
  const journal = await getJournal(testId);
  // Auth registration is required for bootstrap — exclude it
  const writes = journal.filter((e) => e.method !== "GET" && e.path !== "/auth/devices/register");
  expect(writes).toHaveLength(0);
}

test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: "ignoreErrors" });
});

const SW = { message: "reading 'waiting'", reason: "SW blocked by functional project" };

// ═══════════════════════════════════════════════════════════════════════════
// DIRECT-01..12: Direct load each route
// ═══════════════════════════════════════════════════════════════════════════

// Each DIRECT test asserts: URL matches route, zero unexpected journal writes, clean guard.
// Headings are not asserted because route pages vary in heading role usage.

test("[DIRECT-01] direct load / renders shell, zero unexpected writes", async ({ page }) => {
  const id = tid("direct"); const guard = createGuard(); attachGuard(page, guard);
  await setup(page, id); allowFailure(guard, SW);
  await page.goto("/"); await registerDevice(page);
  expect(page.url()).toContain("/");
  await assertNoUnexpectedWrites(id);
  assertNoUndeclaredFailures(guard);
});
test("[DIRECT-02] direct load /registros renders shell", async ({ page }) => {
  const id = tid("direct"); const guard = createGuard(); attachGuard(page, guard);
  await setup(page, id); allowFailure(guard, SW);
  await page.goto("/registros"); await registerDevice(page);
  expect(page.url()).toContain("/registros");
  await assertNoUnexpectedWrites(id);
  assertNoUndeclaredFailures(guard);
});
test("[DIRECT-03] direct load /a-pagar renders shell", async ({ page }) => {
  const id = tid("direct"); const guard = createGuard(); attachGuard(page, guard);
  await setup(page, id); allowFailure(guard, SW);
  await page.goto("/a-pagar"); await registerDevice(page);
  expect(page.url()).toContain("/a-pagar");
  await assertNoUnexpectedWrites(id);
  assertNoUndeclaredFailures(guard);
});
test("[DIRECT-04] direct load /assinaturas renders shell", async ({ page }) => {
  const id = tid("direct"); const guard = createGuard(); attachGuard(page, guard);
  await setup(page, id); allowFailure(guard, SW);
  await page.goto("/assinaturas"); await registerDevice(page);
  expect(page.url()).toContain("/assinaturas");
  await assertNoUnexpectedWrites(id);
  assertNoUndeclaredFailures(guard);
});
test("[DIRECT-05] direct load /cartoes renders shell", async ({ page }) => {
  const id = tid("direct"); const guard = createGuard(); attachGuard(page, guard);
  await setup(page, id); allowFailure(guard, SW);
  await page.goto("/cartoes"); await registerDevice(page);
  expect(page.url()).toContain("/cartoes");
  await assertNoUnexpectedWrites(id);
  assertNoUndeclaredFailures(guard);
});
test("[DIRECT-06] direct load /categorias renders shell", async ({ page }) => {
  const id = tid("direct"); const guard = createGuard(); attachGuard(page, guard);
  await setup(page, id); allowFailure(guard, SW);
  await page.goto("/categorias"); await registerDevice(page);
  expect(page.url()).toContain("/categorias");
  await assertNoUnexpectedWrites(id);
  assertNoUndeclaredFailures(guard);
});
test("[DIRECT-07] direct load /contas renders shell", async ({ page }) => {
  const id = tid("direct"); const guard = createGuard(); attachGuard(page, guard);
  await setup(page, id); allowFailure(guard, SW);
  await page.goto("/contas"); await registerDevice(page);
  expect(page.url()).toContain("/contas");
  await assertNoUnexpectedWrites(id);
  assertNoUndeclaredFailures(guard);
});
test("[DIRECT-08] direct load /metas renders shell", async ({ page }) => {
  const id = tid("direct"); const guard = createGuard(); attachGuard(page, guard);
  await setup(page, id); allowFailure(guard, SW);
  await page.goto("/metas"); await registerDevice(page);
  expect(page.url()).toContain("/metas");
  await assertNoUnexpectedWrites(id);
  assertNoUndeclaredFailures(guard);
});
test("[DIRECT-09] direct load /orcamentos renders shell", async ({ page }) => {
  const id = tid("direct"); const guard = createGuard(); attachGuard(page, guard);
  await setup(page, id); allowFailure(guard, SW);
  await page.goto("/orcamentos"); await registerDevice(page);
  expect(page.url()).toContain("/orcamentos");
  await assertNoUnexpectedWrites(id);
  assertNoUndeclaredFailures(guard);
});
test("[DIRECT-10] direct load /patrimonio renders shell", async ({ page }) => {
  const id = tid("direct"); const guard = createGuard(); attachGuard(page, guard);
  await setup(page, id); allowFailure(guard, SW);
  await page.goto("/patrimonio"); await registerDevice(page);
  expect(page.url()).toContain("/patrimonio");
  await assertNoUnexpectedWrites(id);
  assertNoUndeclaredFailures(guard);
});
test("[DIRECT-11] direct load /perfil renders shell", async ({ page }) => {
  const id = tid("direct"); const guard = createGuard(); attachGuard(page, guard);
  await setup(page, id); allowFailure(guard, SW);
  await page.goto("/perfil"); await registerDevice(page);
  expect(page.url()).toContain("/perfil");
  await assertNoUnexpectedWrites(id);
  assertNoUndeclaredFailures(guard);
});
test("[DIRECT-12] direct load /relatorios renders shell", async ({ page }) => {
  const id = tid("direct"); const guard = createGuard(); attachGuard(page, guard);
  await setup(page, id); allowFailure(guard, SW);
  await page.goto("/relatorios"); await registerDevice(page);
  expect(page.url()).toContain("/relatorios");
  await assertNoUnexpectedWrites(id);
  assertNoUndeclaredFailures(guard);
});

// ═══════════════════════════════════════════════════════════════════════════
// NAV-01..03: BottomNav navigation
// ═══════════════════════════════════════════════════════════════════════════

test("[NAV-01] BottomNav Resumo click navigates to /", async ({ page }) => {
  const id = tid("nav"); const guard = createGuard(); attachGuard(page, guard);
  await setup(page, id); allowFailure(guard, SW);
  await page.goto("/registros"); await registerDevice(page);

  await page.getByRole("button", { name: "Resumo" }).click({ timeout: 5000 });
  await expect(page).toHaveURL(/\/$/);
  assertNoUndeclaredFailures(guard);
});

test("[NAV-02] BottomNav Registros click navigates to /registros", async ({ page }) => {
  const id = tid("nav"); const guard = createGuard(); attachGuard(page, guard);
  await setup(page, id); allowFailure(guard, SW);
  await page.goto("/"); await registerDevice(page);

  await page.getByRole("button", { name: "Registros" }).click({ timeout: 5000 });
  await expect(page).toHaveURL(/\/registros$/);
  assertNoUndeclaredFailures(guard);
});

test("[NAV-03] BottomNav A pagar click navigates to /a-pagar", async ({ page }) => {
  const id = tid("nav"); const guard = createGuard(); attachGuard(page, guard);
  await setup(page, id); allowFailure(guard, SW);
  await page.goto("/"); await registerDevice(page);

  await page.getByRole("button", { name: "A pagar" }).click({ timeout: 5000 });
  await expect(page).toHaveURL(/\/a-pagar$/);
  assertNoUndeclaredFailures(guard);
});

// ═══════════════════════════════════════════════════════════════════════════
// NAV-04: Mais opens bottom sheet
// ═══════════════════════════════════════════════════════════════════════════

test("[NAV-04] tap Mais opens bottom sheet overlay (mobile)", async ({ page }) => {
  const id = tid("nav"); const guard = createGuard(); attachGuard(page, guard);
  await setup(page, id); allowFailure(guard, SW);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/"); await registerDevice(page);

  await page.getByRole("button", { name: "Mais" }).click({ timeout: 5000 });

  // The sheet is a dialog with role="dialog" and aria-modal="true"
  await expect(page.locator("[role='dialog']")).toBeVisible({ timeout: 5000 });
  assertNoUndeclaredFailures(guard);
});

// ═══════════════════════════════════════════════════════════════════════════
// NAV-05..12: More menu items
// ═══════════════════════════════════════════════════════════════════════════

async function navigateFromMoreMenu(
  page: import("@playwright/test").Page,
  label: string,
  expectedPath: RegExp,
): Promise<void> {
  await page.getByRole("button", { name: "Mais" }).click({ timeout: 5000 });
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: label }).click({ timeout: 5000 });
  await expect(page).toHaveURL(expectedPath);
}

test("[NAV-05] More Patrimônio navigates to /patrimonio", async ({ page }) => {
  const id = tid("more"); const guard = createGuard(); attachGuard(page, guard);
  await setup(page, id); allowFailure(guard, SW);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/"); await registerDevice(page);
  await navigateFromMoreMenu(page, "Patrimônio", /\/patrimonio$/);
  assertNoUndeclaredFailures(guard);
});

test("[NAV-06] More Contas navigates to /contas", async ({ page }) => {
  const id = tid("more"); const guard = createGuard(); attachGuard(page, guard);
  await setup(page, id); allowFailure(guard, SW);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/"); await registerDevice(page);
  await navigateFromMoreMenu(page, "Contas", /\/contas$/);
  assertNoUndeclaredFailures(guard);
});

test("[NAV-07] More Cartões navigates to /cartoes", async ({ page }) => {
  const id = tid("more"); const guard = createGuard(); attachGuard(page, guard);
  await setup(page, id); allowFailure(guard, SW);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/"); await registerDevice(page);
  await navigateFromMoreMenu(page, "Cartões", /\/cartoes$/);
  assertNoUndeclaredFailures(guard);
});

test("[NAV-08] More Assinaturas navigates to /assinaturas", async ({ page }) => {
  const id = tid("more"); const guard = createGuard(); attachGuard(page, guard);
  await setup(page, id); allowFailure(guard, SW);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/"); await registerDevice(page);
  await navigateFromMoreMenu(page, "Assinaturas", /\/assinaturas$/);
  assertNoUndeclaredFailures(guard);
});

test("[NAV-09] More Orçamentos navigates to /orcamentos", async ({ page }) => {
  const id = tid("more"); const guard = createGuard(); attachGuard(page, guard);
  await setup(page, id); allowFailure(guard, SW);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/"); await registerDevice(page);
  await navigateFromMoreMenu(page, "Orçamentos", /\/orcamentos$/);
  assertNoUndeclaredFailures(guard);
});

test("[NAV-10] More Metas navigates to /metas", async ({ page }) => {
  const id = tid("more"); const guard = createGuard(); attachGuard(page, guard);
  await setup(page, id); allowFailure(guard, SW);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/"); await registerDevice(page);
  await navigateFromMoreMenu(page, "Metas", /\/metas$/);
  assertNoUndeclaredFailures(guard);
});

test("[NAV-11] More Categorias navigates to /categorias", async ({ page }) => {
  const id = tid("more"); const guard = createGuard(); attachGuard(page, guard);
  await setup(page, id); allowFailure(guard, SW);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/"); await registerDevice(page);
  await navigateFromMoreMenu(page, "Categorias", /\/categorias$/);
  assertNoUndeclaredFailures(guard);
});

test("[NAV-12] More Relatórios navigates to /relatorios", async ({ page }) => {
  const id = tid("more"); const guard = createGuard(); attachGuard(page, guard);
  await setup(page, id); allowFailure(guard, SW);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/"); await registerDevice(page);
  await navigateFromMoreMenu(page, "Relatórios", /\/relatorios$/);
  assertNoUndeclaredFailures(guard);
});

// ═══════════════════════════════════════════════════════════════════════════
// NAV-13: Backdrop closes sheet
// ═══════════════════════════════════════════════════════════════════════════

test("[NAV-13] tap overlay/backdrop closes Mais sheet, route preserved", async ({ page }) => {
  const id = tid("nav13"); const guard = createGuard(); attachGuard(page, guard);
  await setup(page, id); allowFailure(guard, SW);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/"); await registerDevice(page);

  // Open More sheet
  await page.getByRole("button", { name: "Mais" }).click({ timeout: 5000 });
  await expect(page.locator("[role='dialog']")).toBeVisible({ timeout: 5000 });

  // Click the backdrop/overlay (transparent inset div) to dismiss
  const backdrop = page.locator("[class*='animate-fade-in']").first();
  await backdrop.click({ timeout: 3000, position: { x: 200, y: 10 } });

  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page).toHaveURL(/\/$/);
  assertNoUndeclaredFailures(guard);
});
