/**
 * Wallet / Patrimônio E2E tests — WAL-01..10
 *
 * Matrix:
 * WAL-01 open /patrimonio → wallet renders
 * WAL-02 account row → /contas?accountId=X
 * WAL-03 card row → /cartoes?cardId=X
 * WAL-04 Gerenciar (Contas) → /contas
 * WAL-05 Adicionar conta → /contas
 * WAL-06 Gerenciar (Cartões) → /cartoes
 * WAL-07 Adicionar cartão → /cartoes
 * WAL-08 Ver metas → /metas
 * WAL-09 goal row → /metas
 * WAL-10 open statement row → /cartoes?cardId=X
 *
 * Seed: Conta Corrente (acc-1), Dinheiro (acc-2), Nubank card (card-1),
 * open statement stmt-1, goal Reserva de Emergência (goal-1).
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
  return `wal-${counter}`;
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
      /* teardown */
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
  // Next.js RSC prefetches abort on navigation — not app failures
  allowFailure(guard, { url: "_rsc", reason: "RSC prefetch aborted on nav" });
  allowFailure(guard, {
    message: "ERR_ABORTED",
    reason: "RSC prefetch aborted on nav",
  });
  await page.goto("/patrimonio");
  await registerDevice(page);
  await expect(page.getByText("Patrimônio líquido")).toBeVisible({ timeout: 10000 });
  return guard;
}

// ── WAL-01 ─────────────────────────────────────────────────────────────────

test("[WAL-01] open /patrimonio → wallet page renders", async ({ page }) => {
  const id = tid();
  const guard = await init(page, id);

  await expect(page).toHaveURL(/\/patrimonio/);
  await expect(page.getByText("Patrimônio líquido")).toBeVisible();
  await expect(page.getByText("Contas", { exact: true })).toBeVisible();
  await expect(page.getByText("Cartões", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /Conta Corrente/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Nubank/ }).first()).toBeVisible();
  await assertNoUnexpectedWrites(id);
  assertNoUndeclaredFailures(guard);
});

// ── WAL-02 ─────────────────────────────────────────────────────────────────

test("[WAL-02] tap account row → /contas?accountId=X", async ({ page }) => {
  const id = tid();
  const guard = await init(page, id);

  await page.getByRole("link", { name: /Conta Corrente/ }).click();
  await expect(page).toHaveURL(/\/contas\?accountId=acc-1/);
  await expect(page.getByRole("heading", { name: /Contas/i })).toBeVisible({
    timeout: 10000,
  });
  await assertNoUnexpectedWrites(id);
  assertNoUndeclaredFailures(guard);
});

// ── WAL-03 ─────────────────────────────────────────────────────────────────

test("[WAL-03] tap card row → /cartoes?cardId=X", async ({ page }) => {
  const id = tid();
  const guard = await init(page, id);

  // Card section Nubank link (not statement row) — first Nubank link under Cartões
  await page.locator('a[href="/cartoes?cardId=card-1"]').first().click();
  await expect(page).toHaveURL(/\/cartoes\?cardId=card-1/);
  await expect(page.getByRole("heading", { name: /Cartões/i })).toBeVisible({
    timeout: 10000,
  });
  await assertNoUnexpectedWrites(id);
  assertNoUndeclaredFailures(guard);
});

// ── WAL-04 ─────────────────────────────────────────────────────────────────

test("[WAL-04] tap Gerenciar Contas header → /contas", async ({ page }) => {
  const id = tid();
  const guard = await init(page, id);

  // First "Gerenciar" is Contas section header
  await page.getByRole("link", { name: "Gerenciar" }).first().click();
  await expect(page).toHaveURL(/\/contas$/);
  await expect(page.getByRole("heading", { name: /Contas/i })).toBeVisible({
    timeout: 10000,
  });
  await assertNoUnexpectedWrites(id);
  assertNoUndeclaredFailures(guard);
});

// ── WAL-05 ─────────────────────────────────────────────────────────────────

test("[WAL-05] tap Adicionar conta button → /contas", async ({ page }) => {
  const id = tid();
  const guard = await init(page, id);

  await page.getByRole("link", { name: "Adicionar conta" }).click();
  await expect(page).toHaveURL(/\/contas$/);
  await expect(page.getByRole("heading", { name: /Contas/i })).toBeVisible({
    timeout: 10000,
  });
  await assertNoUnexpectedWrites(id);
  assertNoUndeclaredFailures(guard);
});

// ── WAL-06 ─────────────────────────────────────────────────────────────────

test("[WAL-06] tap Gerenciar Cartões header → /cartoes", async ({ page }) => {
  const id = tid();
  const guard = await init(page, id);

  // Second "Gerenciar" is Cartões section header
  await page.getByRole("link", { name: "Gerenciar" }).nth(1).click();
  await expect(page).toHaveURL(/\/cartoes$/);
  await expect(page.getByRole("heading", { name: /Cartões/i })).toBeVisible({
    timeout: 10000,
  });
  await assertNoUnexpectedWrites(id);
  assertNoUndeclaredFailures(guard);
});

// ── WAL-07 ─────────────────────────────────────────────────────────────────

test("[WAL-07] tap Adicionar cartão button → /cartoes", async ({ page }) => {
  const id = tid();
  const guard = await init(page, id);

  await page.getByRole("link", { name: "Adicionar cartão" }).click();
  await expect(page).toHaveURL(/\/cartoes$/);
  await expect(page.getByRole("heading", { name: /Cartões/i })).toBeVisible({
    timeout: 10000,
  });
  await assertNoUnexpectedWrites(id);
  assertNoUndeclaredFailures(guard);
});

// ── WAL-08 ─────────────────────────────────────────────────────────────────

test("[WAL-08] tap Ver metas link → /metas", async ({ page }) => {
  const id = tid();
  const guard = await init(page, id);

  await page.getByRole("link", { name: "Ver metas" }).click();
  await expect(page).toHaveURL(/\/metas$/);
  await expect(page.getByRole("heading", { name: /Metas/i })).toBeVisible({
    timeout: 10000,
  });
  await assertNoUnexpectedWrites(id);
  assertNoUndeclaredFailures(guard);
});

// ── WAL-09 ─────────────────────────────────────────────────────────────────

test("[WAL-09] tap goal row → /metas", async ({ page }) => {
  const id = tid();
  const guard = await init(page, id);

  await page.getByRole("link", { name: /Reserva de Emergência/ }).click();
  await expect(page).toHaveURL(/\/metas$/);
  await expect(page.getByRole("heading", { name: /Metas/i })).toBeVisible({
    timeout: 10000,
  });
  await expect(
    page.getByText("Reserva de Emergência", { exact: true }).first(),
  ).toBeVisible();
  await assertNoUnexpectedWrites(id);
  assertNoUndeclaredFailures(guard);
});

// ── WAL-10 ─────────────────────────────────────────────────────────────────

test("[WAL-10] tap open statement row → /cartoes?cardId=X", async ({ page }) => {
  const id = tid();
  const guard = await init(page, id);

  await expect(
    page.locator("span").filter({ hasText: "Faturas abertas" }),
  ).toBeVisible();
  // Statement rows also link to /cartoes?cardId=card-1 — use last match
  // (card tile is first, statement under Faturas abertas is last)
  await page.locator('a[href="/cartoes?cardId=card-1"]').last().click();
  await expect(page).toHaveURL(/\/cartoes\?cardId=card-1/);
  await expect(page.getByRole("heading", { name: /Cartões/i })).toBeVisible({
    timeout: 10000,
  });
  await assertNoUnexpectedWrites(id);
  assertNoUndeclaredFailures(guard);
});
