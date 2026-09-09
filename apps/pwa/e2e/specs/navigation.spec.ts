/**
 * Navigation E2E tests (canonical IA, item 13).
 * IDs: DIRECT-01..12, NAV-01..13
 *
 * DIRECT: direct-load each canonical route, register device, assert URL +
 *   heading + fixture journal has zero unexpected writes. Legacy page routes
 *   redirect (temporary) to their canonical tab — covered by REDIRECT tests.
 * NAV-01..04: click BottomNav button, assert URL changes.
 * NAV-05..08: FAB quick menu opens and dispatches capture flows.
 * NAV-09..12: Hub grid navigates to module subroutes.
 * NAV-13: FAB menu closes on Escape, route preserved.
 *
 * No body-visibility as acceptance, no conditional locators, no arbitrary waits.
 */

import { test, expect } from "@playwright/test";
import { assertNoUndeclaredFailures } from "../support/failure-guard";
import {
  prepareSpec,
  authenticate as registerDevice,
  getJournal,
} from "../support/harness";

let counter = 0;
function tid(prefix: string): string {
  counter++;
  return `nav-${prefix}-${counter}`;
}

/**
 * Per-test setup for this spec.
 *
 * Every test here deep-links into a route and only then registers — that order
 * is the point of the spec, so it stays in the test bodies rather than being
 * folded into `initSpec`.
 *
 * `baselineAllows: false` keeps the original strict guard: this spec tolerated
 * only the service-worker failure, and inheriting the harness baseline set
 * would leave these tests green while detecting less.
 */
async function setup(page: import("@playwright/test").Page, id: string) {
  return prepareSpec(page, id, {
    baselineAllows: false,
    allow: [{ message: "reading 'waiting'", reason: "SW blocked by functional project" }],
  });
}

/** Assert the fixture journal has no unexpected write entries (exclude auth bootstrap). */
async function assertNoUnexpectedWrites(testId: string): Promise<void> {
  const journal = await getJournal(testId);
  // Email sign-in + device registration are required bootstrap for every
  // authenticated spec (AuthGate always runs sign-in first) — exclude both.
  const writes = journal.filter(
    (e) =>
      e.method !== "GET" &&
      e.path !== "/auth/devices/register" &&
      e.path !== "/auth/sign-in/email",
  );
  expect(writes).toHaveLength(0);
}

test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: "ignoreErrors" });
});


// ═══════════════════════════════════════════════════════════════════════════
// DIRECT-01..12: Direct load each canonical route
// ═══════════════════════════════════════════════════════════════════════════

// Each DIRECT test asserts: URL matches route, zero unexpected journal writes, clean guard.
// Headings are not asserted because route pages vary in heading role usage.

test("[DIRECT-01] direct load / renders shell, zero unexpected writes", async ({ page }) => {
  const id = tid("direct"); const guard = await setup(page, id);
  await page.goto("/"); await registerDevice(page);
  expect(page.url()).toContain("/");
  await assertNoUnexpectedWrites(id);
  assertNoUndeclaredFailures(guard);
});
test("[DIRECT-02] direct load /registros renders shell", async ({ page }) => {
  const id = tid("direct"); const guard = await setup(page, id);
  await page.goto("/registros"); await registerDevice(page);
  expect(page.url()).toContain("/registros");
  await assertNoUnexpectedWrites(id);
  assertNoUndeclaredFailures(guard);
});
test("[DIRECT-03] direct load /compromissos renders shell", async ({ page }) => {
  const id = tid("direct"); const guard = await setup(page, id);
  await page.goto("/compromissos"); await registerDevice(page);
  expect(page.url()).toContain("/compromissos");
  await assertNoUnexpectedWrites(id);
  assertNoUndeclaredFailures(guard);
});
test("[DIRECT-04] direct load /hub renders shell", async ({ page }) => {
  const id = tid("direct"); const guard = await setup(page, id);
  await page.goto("/hub"); await registerDevice(page);
  expect(page.url()).toContain("/hub");
  await assertNoUnexpectedWrites(id);
  assertNoUndeclaredFailures(guard);
});
test("[DIRECT-05] direct load /hub/patrimonio renders shell", async ({ page }) => {
  const id = tid("direct"); const guard = await setup(page, id);
  await page.goto("/hub/patrimonio"); await registerDevice(page);
  expect(page.url()).toContain("/hub/patrimonio");
  await assertNoUnexpectedWrites(id);
  assertNoUndeclaredFailures(guard);
});
test("[DIRECT-06] direct load /hub/planejamento renders shell", async ({ page }) => {
  const id = tid("direct"); const guard = await setup(page, id);
  await page.goto("/hub/planejamento"); await registerDevice(page);
  expect(page.url()).toContain("/hub/planejamento");
  await assertNoUnexpectedWrites(id);
  assertNoUndeclaredFailures(guard);
});
test("[DIRECT-07] direct load /hub/relatorios renders shell", async ({ page }) => {
  const id = tid("direct"); const guard = await setup(page, id);
  await page.goto("/hub/relatorios"); await registerDevice(page);
  expect(page.url()).toContain("/hub/relatorios");
  await assertNoUnexpectedWrites(id);
  assertNoUndeclaredFailures(guard);
});
test("[DIRECT-08] direct load /hub/alertas renders shell", async ({ page }) => {
  const id = tid("direct"); const guard = await setup(page, id);
  await page.goto("/hub/alertas"); await registerDevice(page);
  expect(page.url()).toContain("/hub/alertas");
  await assertNoUnexpectedWrites(id);
  assertNoUndeclaredFailures(guard);
});
test("[DIRECT-09] direct load /hub/categorias renders shell", async ({ page }) => {
  const id = tid("direct"); const guard = await setup(page, id);
  await page.goto("/hub/categorias"); await registerDevice(page);
  expect(page.url()).toContain("/hub/categorias");
  await assertNoUnexpectedWrites(id);
  assertNoUndeclaredFailures(guard);
});
test("[DIRECT-10] direct load /hub/configuracoes renders shell", async ({ page }) => {
  const id = tid("direct"); const guard = await setup(page, id);
  await page.goto("/hub/configuracoes"); await registerDevice(page);
  expect(page.url()).toContain("/hub/configuracoes");
  await assertNoUnexpectedWrites(id);
  assertNoUndeclaredFailures(guard);
});
test("[DIRECT-11] direct load /perfil renders shell", async ({ page }) => {
  const id = tid("direct"); const guard = await setup(page, id);
  await page.goto("/perfil"); await registerDevice(page);
  expect(page.url()).toContain("/perfil");
  await assertNoUnexpectedWrites(id);
  assertNoUndeclaredFailures(guard);
});
test("[DIRECT-12] direct load /compromissos?aba=pendencias selects the tab", async ({ page }) => {
  const id = tid("direct"); const guard = await setup(page, id);
  await page.goto("/compromissos?aba=pendencias"); await registerDevice(page);
  expect(page.url()).toContain("/compromissos");
  await assertNoUnexpectedWrites(id);
  assertNoUndeclaredFailures(guard);
});

// ═══════════════════════════════════════════════════════════════════════════
// REDIRECT-01..04: Legacy page routes land on canonical tabs
// ═══════════════════════════════════════════════════════════════════════════

test("[REDIRECT-01] legacy /a-pagar lands on /compromissos?aba=a-pagar", async ({ page }) => {
  const id = tid("redirect"); const guard = await setup(page, id);
  await page.goto("/a-pagar"); await registerDevice(page);
  await expect(page).toHaveURL(/\/compromissos\?aba=a-pagar/);
  assertNoUndeclaredFailures(guard);
});
test("[REDIRECT-02] legacy /contas lands on /hub/patrimonio?aba=contas", async ({ page }) => {
  const id = tid("redirect"); const guard = await setup(page, id);
  await page.goto("/contas"); await registerDevice(page);
  await expect(page).toHaveURL(/\/hub\/patrimonio\?aba=contas/);
  assertNoUndeclaredFailures(guard);
});
test("[REDIRECT-03] legacy /cartoes?cardId=<id> preserves the detail param", async ({ page }) => {
  const id = tid("redirect"); const guard = await setup(page, id);
  await page.goto("/cartoes?cardId=card-1"); await registerDevice(page);
  // Next.js merges the preserved query with the redirect target; the
  // original param comes first (?cardId=..&aba=cartoes), so match aba=
  // in either position.
  await expect(page).toHaveURL(/\/hub\/patrimonio\?([^&]*&)?aba=cartoes/);
  expect(page.url()).toContain("cardId=card-1");
  assertNoUndeclaredFailures(guard);
});
test("[REDIRECT-04] legacy /pending lands on /compromissos?aba=pendencias", async ({ page }) => {
  const id = tid("redirect"); const guard = await setup(page, id);
  await page.goto("/pending"); await registerDevice(page);
  await expect(page).toHaveURL(/\/compromissos\?aba=pendencias/);
  assertNoUndeclaredFailures(guard);
});

// ═══════════════════════════════════════════════════════════════════════════
// NAV-01..04: BottomNav navigation
// ═══════════════════════════════════════════════════════════════════════════

test("[NAV-01] BottomNav Início click navigates to /", async ({ page }) => {
  const id = tid("nav"); const guard = await setup(page, id);
  await page.goto("/registros"); await registerDevice(page);

  await page.getByRole("button", { name: "Início" }).click({ timeout: 5000 });
  await expect(page).toHaveURL(/\/$/);
  assertNoUndeclaredFailures(guard);
});

test("[NAV-02] BottomNav Extrato click navigates to /registros", async ({ page }) => {
  const id = tid("nav"); const guard = await setup(page, id);
  await page.goto("/"); await registerDevice(page);

  await page.getByRole("button", { name: "Extrato" }).click({ timeout: 5000 });
  await expect(page).toHaveURL(/\/registros$/);
  assertNoUndeclaredFailures(guard);
});

test("[NAV-03] BottomNav Compromissos click navigates to /compromissos", async ({ page }) => {
  const id = tid("nav"); const guard = await setup(page, id);
  await page.goto("/"); await registerDevice(page);

  await page.getByRole("button", { name: "Compromissos" }).click({ timeout: 5000 });
  await expect(page).toHaveURL(/\/compromissos$/);
  assertNoUndeclaredFailures(guard);
});

test("[NAV-04] BottomNav Hub click navigates to /hub", async ({ page }) => {
  const id = tid("nav"); const guard = await setup(page, id);
  await page.goto("/"); await registerDevice(page);

  await page.getByRole("button", { name: "Hub" }).click({ timeout: 5000 });
  await expect(page).toHaveURL(/\/hub$/);
  assertNoUndeclaredFailures(guard);
});

// ═══════════════════════════════════════════════════════════════════════════
// NAV-05..08: FAB quick menu
// ═══════════════════════════════════════════════════════════════════════════

test("[NAV-05] FAB opens the quick menu with 4 actions", async ({ page }) => {
  const id = tid("nav"); const guard = await setup(page, id);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/"); await registerDevice(page);

  await page.getByRole("button", { name: "Nova transação" }).click({ timeout: 5000 });
  await expect(page.getByRole("menu", { name: "Novo lançamento" })).toBeVisible({ timeout: 5000 });
  assertNoUndeclaredFailures(guard);
});

test("[NAV-06] quick menu Despesa opens the preselected expense sheet", async ({ page }) => {
  const id = tid("nav"); const guard = await setup(page, id);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/"); await registerDevice(page);

  await page.getByRole("button", { name: "Nova transação" }).click({ timeout: 5000 });
  await page.getByRole("menuitem", { name: "Despesa" }).click({ timeout: 5000 });
  await expect(page.getByText("Nova despesa")).toBeVisible({ timeout: 5000 });
  assertNoUndeclaredFailures(guard);
});

test("[NAV-07] quick menu Ler Comprovante navigates to /capture", async ({ page }) => {
  const id = tid("nav"); const guard = await setup(page, id);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/"); await registerDevice(page);

  await page.getByRole("button", { name: "Nova transação" }).click({ timeout: 5000 });
  await page.getByRole("menuitem", { name: "Ler Comprovante" }).click({ timeout: 5000 });
  await expect(page).toHaveURL(/\/capture/);
  assertNoUndeclaredFailures(guard);
});

test("[NAV-08] quick menu Transferência opens the preselected transfer sheet", async ({ page }) => {
  const id = tid("nav"); const guard = await setup(page, id);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/"); await registerDevice(page);

  await page.getByRole("button", { name: "Nova transação" }).click({ timeout: 5000 });
  await page.getByRole("menuitem", { name: "Transferência" }).click({ timeout: 5000 });
  await expect(page.getByText("Nova transferência")).toBeVisible({ timeout: 5000 });
  assertNoUndeclaredFailures(guard);
});

// ═══════════════════════════════════════════════════════════════════════════
// NAV-09..12: Hub grid modules
// ═══════════════════════════════════════════════════════════════════════════

async function navigateFromHub(
  page: import("@playwright/test").Page,
  label: string,
  expectedPath: RegExp,
): Promise<void> {
  await page.getByRole("button", { name: "Hub" }).click({ timeout: 5000 });
  await expect(page).toHaveURL(/\/hub$/);
  await page.getByRole("link", { name: new RegExp(label) }).click({ timeout: 5000 });
  await expect(page).toHaveURL(expectedPath);
}

test("[NAV-09] Hub Patrimônio navigates to /hub/patrimonio", async ({ page }) => {
  const id = tid("hub"); const guard = await setup(page, id);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/"); await registerDevice(page);
  await navigateFromHub(page, "Patrimônio", /\/hub\/patrimonio$/);
  assertNoUndeclaredFailures(guard);
});

test("[NAV-10] Hub Planejamento navigates to /hub/planejamento", async ({ page }) => {
  const id = tid("hub"); const guard = await setup(page, id);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/"); await registerDevice(page);
  await navigateFromHub(page, "Planejamento", /\/hub\/planejamento$/);
  assertNoUndeclaredFailures(guard);
});

test("[NAV-11] Hub Alertas navigates to /hub/alertas", async ({ page }) => {
  const id = tid("hub"); const guard = await setup(page, id);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/"); await registerDevice(page);
  await navigateFromHub(page, "Alertas", /\/hub\/alertas$/);
  assertNoUndeclaredFailures(guard);
});

test("[NAV-12] Hub Configurações navigates to /hub/configuracoes", async ({ page }) => {
  const id = tid("hub"); const guard = await setup(page, id);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/"); await registerDevice(page);
  await navigateFromHub(page, "Configurações", /\/hub\/configuracoes$/);
  assertNoUndeclaredFailures(guard);
});

// ═══════════════════════════════════════════════════════════════════════════
// NAV-13: Escape closes the quick menu, route preserved
// ═══════════════════════════════════════════════════════════════════════════

test("[NAV-13] Escape closes the FAB quick menu, route preserved", async ({ page }) => {
  const id = tid("nav13"); const guard = await setup(page, id);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/"); await registerDevice(page);

  await page.getByRole("button", { name: "Nova transação" }).click({ timeout: 5000 });
  await expect(page.getByRole("menu")).toBeVisible({ timeout: 5000 });

  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toBeHidden();
  await expect(page).toHaveURL(/\/$/);
  assertNoUndeclaredFailures(guard);
});
