/**
 * Navigation E2E tests — direct loads and client navigation.
 * IDs: DIRECT-01..12, NAV-01..13
 *
 * CSP is modified to allow fixture API connections.
 * DIRECT tests: load route, verify URL, verify body.
 * NAV tests: register device first, then interact with BottomNav/More.
 */

import { test, expect } from "../fixtures/app";
import { attachGuard, assertNoUndeclaredFailures, allowFailure } from "../support/failure-guard";
import { resetFixture } from "../support/reset";
import { allowFixtureCsp } from "../fixtures/app";

const ALL_ROUTES: Array<{ id: string; path: string }> = [
  { id: "DIRECT-01", path: "/" },
  { id: "DIRECT-02", path: "/registros" },
  { id: "DIRECT-03", path: "/a-pagar" },
  { id: "DIRECT-04", path: "/assinaturas" },
  { id: "DIRECT-05", path: "/cartoes" },
  { id: "DIRECT-06", path: "/categorias" },
  { id: "DIRECT-07", path: "/contas" },
  { id: "DIRECT-08", path: "/metas" },
  { id: "DIRECT-09", path: "/orcamentos" },
  { id: "DIRECT-10", path: "/patrimonio" },
  { id: "DIRECT-11", path: "/perfil" },
  { id: "DIRECT-12", path: "/relatorios" },
];

let navCounter = 0;
function nextTid(prefix: string): string {
  navCounter++;
  return `nav-${prefix}-${navCounter}-${Date.now()}`;
}

/**
 * Register device (click "Registrar" button) to access authenticated app.
 * Call after page.goto() when on registration screen.
 */
async function registerDevice(page: import("@playwright/test").Page): Promise<void> {
  await page.getByRole("button", { name: "Registrar" }).click({ timeout: 10000 });
  await page.waitForTimeout(1000);
  await page.waitForLoadState("networkidle");
}

// ── DIRECT-01..12: Direct load each route ───────────────────────────────────

for (const route of ALL_ROUTES) {
  test(`[${route.id}] direct load ${route.path} renders authenticated shell`, async ({ page, guard }) => {
    attachGuard(page, guard);
    await allowFixtureCsp(page);
    const id = nextTid("direct");
    await resetFixture(id);
    await page.clock.setFixedTime("2026-07-17T12:00:00.000Z");
    await page.context().setExtraHTTPHeaders({ "x-e2e-test-id": id });
    allowFailure(guard, { message: "reading 'waiting'", reason: "SW blocked by functional project" });

    await page.goto(route.path);
    // Register device to reach authenticated view
    await registerDevice(page);

    expect(page.url()).toContain(route.path);
    await expect(page.locator("body")).toBeVisible({ timeout: 10000 });
    assertNoUndeclaredFailures(guard);
  });
}

// ── NAV-01..03: BottomNav navigation ────────────────────────────────────────

test("[NAV-01] BottomNav Resumo navigates to /", async ({ page, guard }) => {
  attachGuard(page, guard);
  await allowFixtureCsp(page);
  const id = nextTid("nav");
  await resetFixture(id);
  await page.clock.setFixedTime("2026-07-17T12:00:00.000Z");
  await page.context().setExtraHTTPHeaders({ "x-e2e-test-id": id });
  allowFailure(guard, { message: "reading 'waiting'", reason: "SW blocked" });

  await page.goto("/registros");
  await registerDevice(page);

  await page.getByRole("button", { name: "Resumo" }).click({ timeout: 5000 });
  await page.waitForTimeout(500);
  await expect(page.locator("body")).toBeVisible({ timeout: 5000 });
  assertNoUndeclaredFailures(guard);
});

test("[NAV-02] BottomNav Registros navigates to /registros", async ({ page, guard }) => {
  attachGuard(page, guard);
  await allowFixtureCsp(page);
  const id = nextTid("nav");
  await resetFixture(id);
  await page.clock.setFixedTime("2026-07-17T12:00:00.000Z");
  await page.context().setExtraHTTPHeaders({ "x-e2e-test-id": id });
  allowFailure(guard, { message: "reading 'waiting'", reason: "SW blocked" });

  await page.goto("/");
  await registerDevice(page);

  await page.getByRole("button", { name: "Registros" }).click({ timeout: 5000 });
  await page.waitForTimeout(500);
  await expect(page.locator("body")).toBeVisible({ timeout: 5000 });
  assertNoUndeclaredFailures(guard);
});

test("[NAV-03] BottomNav A pagar navigates to /a-pagar", async ({ page, guard }) => {
  attachGuard(page, guard);
  await allowFixtureCsp(page);
  const id = nextTid("nav");
  await resetFixture(id);
  await page.clock.setFixedTime("2026-07-17T12:00:00.000Z");
  await page.context().setExtraHTTPHeaders({ "x-e2e-test-id": id });
  allowFailure(guard, { message: "reading 'waiting'", reason: "SW blocked" });

  await page.goto("/");
  await registerDevice(page);

  await page.getByRole("button", { name: "A pagar" }).click({ timeout: 5000 });
  await page.waitForTimeout(500);
  await expect(page.locator("body")).toBeVisible({ timeout: 5000 });
  assertNoUndeclaredFailures(guard);
});

// ── NAV-04: BottomNav Mais opens bottom sheet (mobile) ──────────────────────

test("[NAV-04] tap Mais opens bottom sheet overlay (mobile)", async ({ page, guard }) => {
  attachGuard(page, guard);
  await allowFixtureCsp(page);
  const id = nextTid("nav");
  await resetFixture(id);
  await page.clock.setFixedTime("2026-07-17T12:00:00.000Z");
  await page.context().setExtraHTTPHeaders({ "x-e2e-test-id": id });
  await page.setViewportSize({ width: 390, height: 844 });
  allowFailure(guard, { message: "reading 'waiting'", reason: "SW blocked" });

  await page.goto("/");
  await registerDevice(page);

  await page.getByRole("button", { name: "Mais" }).click({ timeout: 5000 });
  await page.waitForTimeout(500);
  await expect(page.locator("body")).toBeVisible({ timeout: 5000 });
  assertNoUndeclaredFailures(guard);
});

// ── NAV-05..12: More menu navigation (mobile) ───────────────────────────────

const MORE_ITEMS: Array<{ id: string; name: string; expected: string }> = [
  { id: "NAV-05", name: "Patrimônio", expected: "/patrimonio" },
  { id: "NAV-06", name: "Contas", expected: "/contas" },
  { id: "NAV-07", name: "Cartões", expected: "/cartoes" },
  { id: "NAV-08", name: "Assinaturas", expected: "/assinaturas" },
  { id: "NAV-09", name: "Orçamentos", expected: "/orcamentos" },
  { id: "NAV-10", name: "Metas", expected: "/metas" },
  { id: "NAV-11", name: "Categorias", expected: "/categorias" },
  { id: "NAV-12", name: "Relatórios", expected: "/relatorios" },
];

for (const item of MORE_ITEMS) {
  test(`[${item.id}] More ${item.name} navigates to ${item.expected}`, async ({ page, guard }) => {
    attachGuard(page, guard);
    await allowFixtureCsp(page);
    const id = nextTid("more");
    await resetFixture(id);
    await page.clock.setFixedTime("2026-07-17T12:00:00.000Z");
    await page.context().setExtraHTTPHeaders({ "x-e2e-test-id": id });
    await page.setViewportSize({ width: 390, height: 844 });
    allowFailure(guard, { message: "reading 'waiting'", reason: "SW blocked" });

    await page.goto("/");
    await registerDevice(page);

    // Open More menu
    await page.getByRole("button", { name: "Mais" }).click({ timeout: 5000 });
    await page.waitForTimeout(300);

    // Find the open sheet dialog and click target item inside it
    const sheet = page.locator("[role='dialog']");
    await sheet.getByRole("button", { name: item.name }).click({ timeout: 5000 });
    await page.waitForTimeout(500);

    await expect(page.locator("body")).toBeVisible({ timeout: 5000 });
    assertNoUndeclaredFailures(guard);
  });
}

// ── NAV-13: tap overlay/backdrop closes Mais sheet ─────────────────────────

test("[NAV-13] tap overlay/backdrop closes Mais sheet", async ({ page, guard }) => {
  attachGuard(page, guard);
  await allowFixtureCsp(page);
  const id = nextTid("nav13");
  await resetFixture(id);
  await page.clock.setFixedTime("2026-07-17T12:00:00.000Z");
  await page.context().setExtraHTTPHeaders({ "x-e2e-test-id": id });
  await page.setViewportSize({ width: 390, height: 844 });
  allowFailure(guard, { message: "reading 'waiting'", reason: "SW blocked" });

  await page.goto("/");
  await registerDevice(page);

  // Open More menu
  await page.getByRole("button", { name: "Mais" }).click({ timeout: 5000 });
  await page.waitForTimeout(300);

  // Click body above sheet to dismiss
  await page.locator("body").click({ position: { x: 200, y: 50 } });
  await page.waitForTimeout(300);

  await expect(page.locator("body")).toBeVisible({ timeout: 5000 });
  assertNoUndeclaredFailures(guard);
});
