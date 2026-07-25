/**
 * Home page E2E tests — HOME-01..10
 *
 * Matrix:
 * HOME-01 profile button → /perfil
 * HOME-02 bell → notification sheet opens
 * HOME-03 quick expense → expense sheet
 * HOME-04 account card → /contas
 * HOME-05 card card → /cartoes
 * HOME-06 payable card → /a-pagar
 * HOME-07 notification item → navigates to target
 * HOME-08 dismiss notification → removed
 * HOME-09 quick income → income sheet
 * HOME-10 quick transfer → transfer sheet
 *
 * Harness aligned with auth/transaction (CSP + reset + fixed clock + register).
 * Seed: Conta Corrente, Dinheiro, Nubank card; payables Conta de Luz / Internet.
 * Fixed clock 2026-07-17 → Internet overdue notification present.
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
  return `home-${counter}`;
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
      // Avoid "route.fetch: Test ended" when teardown aborts in-flight handlers.
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

async function getJournal(
  testId: string,
): Promise<Array<{ method: string; path: string; status: number }>> {
  const res = await fetch(`${FIXTURE_URL}/__e2e/journal?testId=${testId}`, {
    headers: { "x-e2e-test-id": testId },
  });
  if (!res.ok) return [];
  return res.json();
}

/** Write verbs that are unexpected on pure navigation/open flows. */
const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const AUTH_WRITE_PATHS = new Set(["/auth/devices/register"]);

async function assertNoUnexpectedWrites(testId: string): Promise<void> {
  const journal = await getJournal(testId);
  const unexpected = journal.filter(
    (e) => WRITE_METHODS.has(e.method) && !AUTH_WRITE_PATHS.has(e.path),
  );
  expect(unexpected).toEqual([]);
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
  // Clear dismissed notifications so HOME-07/08 see seed alerts
  await page.addInitScript(() => {
    try {
      localStorage.removeItem("pi-finance:notifications-dismissed");
    } catch {
      /* noop */
    }
  });
  await page.goto("/");
  await registerDevice(page);
  return guard;
}

// ── HOME-01 ────────────────────────────────────────────────────────────────

test("[HOME-01] profile button navigates to /perfil", async ({ page }) => {
  const id = tid();
  const guard = await init(page, id);

  await page.getByRole("button", { name: "Abrir perfil" }).click();
  await expect(page).toHaveURL(/\/perfil$/);
  await expect(page.getByRole("heading", { name: /perfil|conta/i })).toBeVisible({
    timeout: 10000,
  });
  await assertNoUnexpectedWrites(id);
  assertNoUndeclaredFailures(guard);
});

// ── HOME-02 ────────────────────────────────────────────────────────────────

test("[HOME-02] tap notification bell opens notification sheet", async ({ page }) => {
  const id = tid();
  const guard = await init(page, id);

  await page.getByRole("button", { name: "Notificações" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Notificações")).toBeVisible();
  await expect(dialog.getByText("Alertas do Pi")).toBeVisible();
  await assertNoUnexpectedWrites(id);
  assertNoUndeclaredFailures(guard);
});

// ── HOME-03 ────────────────────────────────────────────────────────────────

test("[HOME-03] tap quick expense opens expense sheet", async ({ page }) => {
  const id = tid();
  const guard = await init(page, id);

  await page.getByRole("button", { name: /^Despesa$/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Nova despesa")).toBeVisible();
  await expect(dialog.getByRole("button", { name: /^Despesa$/ })).toBeVisible();
  await expect(dialog.getByPlaceholder("0,00")).toBeVisible();

  // Negative: cancel/close is safe
  await dialog.getByRole("button", { name: "Fechar" }).click();
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(/\/$/);
  await assertNoUnexpectedWrites(id);
  assertNoUndeclaredFailures(guard);
});

// ── HOME-04 ────────────────────────────────────────────────────────────────

test("[HOME-04] account card navigates to /contas", async ({ page }) => {
  const id = tid();
  const guard = await init(page, id);

  await page.getByRole("button", { name: "Abrir Conta Corrente em Contas" }).click();
  await expect(page).toHaveURL(/\/contas/);
  await assertNoUnexpectedWrites(id);
  assertNoUndeclaredFailures(guard);
});

// ── HOME-05 ────────────────────────────────────────────────────────────────

test("[HOME-05] card card navigates to /cartoes", async ({ page }) => {
  const id = tid();
  const guard = await init(page, id);

  await page.getByRole("button", { name: "Abrir Nubank em Cartões" }).click();
  await expect(page).toHaveURL(/\/cartoes/);
  await assertNoUnexpectedWrites(id);
  assertNoUndeclaredFailures(guard);
});

// ── HOME-06 ────────────────────────────────────────────────────────────────

test("[HOME-06] payable card navigates to /a-pagar", async ({ page }) => {
  const id = tid();
  const guard = await init(page, id);

  // Payable summary card is a clickable region (div), not a button
  await page.getByText(/Contas a pagar/).click();
  await expect(page).toHaveURL(/\/a-pagar$/);
  await assertNoUnexpectedWrites(id);
  assertNoUndeclaredFailures(guard);
});

// ── HOME-07 ────────────────────────────────────────────────────────────────

test("[HOME-07] tap notification item navigates to target", async ({ page }) => {
  const id = tid();
  const guard = await init(page, id);

  await page.getByRole("button", { name: "Notificações" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  // Seed Internet due 2026-07-15 with clock 2026-07-17 → overdue payable alert → /a-pagar
  const item = dialog.getByTestId("notification-item").first();
  await expect(item).toBeVisible();
  await item.getByRole("button", { name: "Abrir" }).click();

  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(/\/a-pagar/);
  await assertNoUnexpectedWrites(id);
  assertNoUndeclaredFailures(guard);
});

// ── HOME-08 ────────────────────────────────────────────────────────────────

test("[HOME-08] dismiss notification removes it", async ({ page }) => {
  const id = tid();
  const guard = await init(page, id);

  await page.getByRole("button", { name: "Notificações" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  const items = dialog.getByTestId("notification-item");
  const before = await items.count();
  expect(before).toBeGreaterThan(0);

  const firstTitle = await items.first().locator(".text-\\[14px\\]").textContent();
  await items.first().getByRole("button", { name: "Dispensar" }).click();

  // Item removed from list
  await expect(items).toHaveCount(before - 1);
  if (firstTitle) {
    await expect(dialog.getByText(firstTitle, { exact: true })).toHaveCount(0);
  }

  await assertNoUnexpectedWrites(id);
  assertNoUndeclaredFailures(guard);
});

// ── HOME-09 ────────────────────────────────────────────────────────────────

test("[HOME-09] tap quick income opens income sheet", async ({ page }) => {
  const id = tid();
  const guard = await init(page, id);

  await page.getByRole("button", { name: /^Receita$/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Nova receita")).toBeVisible();
  await expect(dialog.getByRole("button", { name: /^Receita$/ })).toBeVisible();
  await expect(dialog.getByPlaceholder("0,00")).toBeVisible();

  await dialog.getByRole("button", { name: "Fechar" }).click();
  await expect(dialog).toBeHidden();
  await assertNoUnexpectedWrites(id);
  assertNoUndeclaredFailures(guard);
});

// ── HOME-10 ────────────────────────────────────────────────────────────────

test("[HOME-10] tap quick transfer opens transfer sheet", async ({ page }) => {
  const id = tid();
  const guard = await init(page, id);

  await page.getByRole("button", { name: /^Transferir$/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Nova transferência")).toBeVisible();
  await expect(dialog.getByText("Origem (saída)")).toBeVisible();
  await expect(dialog.getByText("Destino (entrada)")).toBeVisible();

  await dialog.getByRole("button", { name: "Fechar" }).click();
  await expect(dialog).toBeHidden();
  await assertNoUnexpectedWrites(id);
  assertNoUndeclaredFailures(guard);
});
