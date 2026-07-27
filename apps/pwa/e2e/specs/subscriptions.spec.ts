/**
 * Subscriptions E2E tests — SUB-01..05
 *
 * Matrix:
 * SUB-01 subscription tab → list renders
 * SUB-02 create subscription → POST /subscriptions
 * SUB-03 detail subscription → display values
 * SUB-04 edit subscription → PATCH /subscriptions/:id
 * SUB-05 cancel subscription → POST /subscriptions/:id/cancel
 *
 * Seed: Netflix (sub-1, active, 55.90/month, credit_card).
 */

import { test, expect } from "@playwright/test";
import {
  allowFailure,
  assertNoUndeclaredFailures,
  attachGuard,
  createGuard,
} from "../support/failure-guard";
import { FIXTURE_URL } from "../support/reset";

const SW = { message: "reading 'waiting'", reason: "SW blocked" };
let counter = 0;
function tid(): string { counter += 1; return `sub-${counter}`; }

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
    } catch { /* teardown */ }
  });
}

test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: "ignoreErrors" }); });

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

async function expectJournalEntry(
  testId: string, method: string, path: string | RegExp, status: number,
): Promise<void> {
  await expect
    .poll(async () => getJournal(testId))
    .toContainEqual(expect.objectContaining({ method, path, status }));
}

async function registerDevice(page: import("@playwright/test").Page): Promise<void> {
  const registerButton = page.getByRole("button", { name: "Registrar" });
  await expect(registerButton).toBeVisible({ timeout: 15000 });
  await registerButton.click();
  await expect(page.getByLabel("Nova transação")).toBeVisible({ timeout: 15000 });
}

async function init(page: import("@playwright/test").Page, id: string): Promise<ReturnType<typeof createGuard>> {
  const guard = createGuard();
  attachGuard(page, guard);
  await allowFixtureCsp(page);
  await resetFixture(id);
  await page.clock.setFixedTime("2026-07-17T12:00:00.000Z");
  await page.context().setExtraHTTPHeaders({ "x-e2e-test-id": id });
  allowFailure(guard, SW);
  await page.goto("/");
  await registerDevice(page);
  await page.goto("/assinaturas");
  await expect(page.getByRole("heading", { name: /Assinaturas/i })).toBeVisible({ timeout: 10000 });
  return guard;
}

// ── SUB-01 ──────────────────────────────────────────────────────────────────

test("[SUB-01] subscription tab renders list", async ({ page }) => {
  const id = tid();
  const guard = await init(page, id);

  await expect(page.getByText("Netflix").first()).toBeVisible({ timeout: 5000 });
  const journal = await getJournal(id);
  const writes = journal.filter(
    (e) => ["POST", "PUT", "PATCH", "DELETE"].includes(e.method) && !e.path.startsWith("/auth"),
  );
  expect(writes).toHaveLength(0);
  assertNoUndeclaredFailures(guard);
});

// ── SUB-02 ──────────────────────────────────────────────────────────────────

test("[SUB-02] create subscription via POST /subscriptions", async ({ page }) => {
  const id = tid();
  const guard = await init(page, id);

  await page.getByRole("button", { name: /Nova|Adicionar|Criar/i }).click();
  const form = page.getByRole("dialog");
  await expect(form).toBeVisible({ timeout: 5000 });

  // Negative: cancel
  await form.getByRole("button", { name: /Cancelar/i }).click();
  await expect(form).toBeHidden();
  let journal = await getJournal(id);
  expect(journal.filter((e) => e.method === "POST" && e.path === "/subscriptions")).toHaveLength(0);

  // Happy path
  await page.getByRole("button", { name: /Nova|Adicionar|Criar/i }).click();
  await expect(form).toBeVisible({ timeout: 5000 });
  await form.getByPlaceholder(/nome|descri/i).fill("Spotify Premium");
  const amountInput = form.getByPlaceholder(/0,00|valor/i);
  if (await amountInput.isVisible()) {
    await amountInput.fill("2190");
  }
  await form.getByRole("button", { name: /Salvar|Criar/i }).click();
  await expectJournalEntry(id, "POST", "/subscriptions", 200);
  assertNoUndeclaredFailures(guard);
});

// ── SUB-03 ──────────────────────────────────────────────────────────────────

test("[SUB-03] detail subscription displays values", async ({ page }) => {
  const id = tid();
  const guard = await init(page, id);

  await page.getByText("Netflix").first().click();
  // Should show amount and cycle info
  await expect(page.getByText(/55,90|R\$/i).first()).toBeVisible({ timeout: 5000 });
  const journal = await getJournal(id);
  const writes = journal.filter(
    (e) => ["POST", "PUT", "PATCH", "DELETE"].includes(e.method) && !e.path.startsWith("/auth"),
  );
  expect(writes).toHaveLength(0);
  assertNoUndeclaredFailures(guard);
});

// ── SUB-04 ──────────────────────────────────────────────────────────────────

test("[SUB-04] edit subscription via PATCH /subscriptions/:id", async ({ page }) => {
  const id = tid();
  const guard = await init(page, id);

  await page.getByText("Netflix").first().click();
  const editBtn = page.getByRole("button", { name: /Editar/i });
  if (await editBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await editBtn.click();
    const form = page.getByRole("dialog");
    await expect(form).toBeVisible({ timeout: 3000 });
    const nameInput = form.getByPlaceholder(/nome|descri/i);
    if (await nameInput.isVisible()) {
      await nameInput.clear();
      await nameInput.fill("Netflix Premium");
    }
    await form.getByRole("button", { name: /Salvar/i }).click();
  }

  await expectJournalEntry(id, "PATCH", /^\/subscriptions\/[a-zA-Z0-9_-]+$/, 200);
  assertNoUndeclaredFailures(guard);
});

// ── SUB-05 ──────────────────────────────────────────────────────────────────

test("[SUB-05] cancel subscription via POST /subscriptions/:id/cancel", async ({ page }) => {
  const id = tid();
  const guard = await init(page, id);

  await page.getByText("Netflix").first().click();
  const cancelBtn = page.getByRole("button", { name: /Cancelar|Desativar/i });
  if (await cancelBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await cancelBtn.click();
    // Negative: cancel the cancel
    const noBtn = page.getByRole("button", { name: /Não|Cancelar/i });
    if (await noBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await noBtn.click();
      let journal = await getJournal(id);
      expect(journal.filter((e) => e.method === "POST" && e.path.includes("cancel"))).toHaveLength(0);
      await cancelBtn.click();
    }
    await page.getByRole("button", { name: /Sim|Confirmar/i }).click();
  }

  await expectJournalEntry(id, "POST", /\/cancel$/, 200);
  assertNoUndeclaredFailures(guard);
});
