/**
 * Card statement real payment E2E — PAYSTMT-01..02
 *
 * Canonical flow: pay a credit-card invoice in full and verify the effect
 * (statement paid, pay CTA disabled, "Paga" badge after reload).
 *
 * Real UI (CardsPage.tsx):
 *   - /hub/patrimonio?aba=cartoes → tap "Nubank" → inline detail with
 *     "Pagar fatura" button (disabled when the selected statement is paid).
 *   - PayStatementSheet titled "Pagar fatura": Total/Parcial toggle
 *     (full by default), "Pagar com a conta" chips (non-card accounts),
 *     CTA "Pagar fatura total" (disabled until an account is picked).
 *   - onPay → payStatement(selectedStatementId, { amountCents, fromAccountId })
 *     → POST /cards/statements/:id/pay.
 * Seed (populated): card-1 "Nubank", stmt-1 open total 120000c;
 *   acc-1 "Conta Corrente", acc-2 "Dinheiro".
 * Fixture POST .../pay accumulates paidCents and flips status to paid.
 */

import { test, expect } from "@playwright/test";
import { assertNoUndeclaredFailures } from "../support/failure-guard";
import { initSpec, expectJournal } from "../support/harness";

let counter = 0;
function tid(): string {
  counter += 1;
  return `paystmt-${counter}`;
}

test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: "ignoreErrors" });
});

async function init(page: import("@playwright/test").Page, id: string) {
  const guard = await initSpec(page, id, { navigateTo: "/hub/patrimonio?aba=cartoes" });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByText("Nubank").first()).toBeVisible({ timeout: 10000 });
  return guard;
}

/** Open the card detail and then the "Pagar fatura" sheet. */
async function openPaySheet(page: import("@playwright/test").Page) {
  await page.getByText("Nubank").first().click();
  const payBtn = page.getByRole("button", { name: "Pagar fatura", exact: true });
  await expect(payBtn).toBeVisible({ timeout: 5000 });
  await payBtn.click();
  await expect(page.getByRole("heading", { name: "Pagar fatura" })).toBeVisible({ timeout: 5000 });
}

/** Pick the checking account and confirm the full payment. */
async function confirmFullPayment(page: import("@playwright/test").Page) {
  const sheet = page.locator('[role="dialog"]');
  await sheet.getByRole("button", { name: "Conta Corrente" }).click();
  const confirm = sheet.getByRole("button", { name: "Pagar fatura total" });
  await expect(confirm).toBeEnabled();
  await confirm.click();
}

// ── PAYSTMT-01 ──────────────────────────────────────────────────────────────

test("[PAYSTMT-01] pay invoice in full → POST /cards/statements/:id/pay", async ({ page }) => {
  const id = tid();
  const guard = await init(page, id);

  await openPaySheet(page);
  await confirmFullPayment(page);

  // Sheet closes on success; journal records the real payment.
  await expect(page.getByRole("heading", { name: "Pagar fatura" })).not.toBeVisible({ timeout: 10000 });
  await expectJournal(id, "POST", "/cards/statements/stmt-1/pay", 200);

  assertNoUndeclaredFailures(guard);
});

// ── PAYSTMT-02 ──────────────────────────────────────────────────────────────

test("[PAYSTMT-02] paid invoice shows Paga badge and disabled pay CTA after reload", async ({ page }) => {
  const id = tid();
  const guard = await init(page, id);

  await openPaySheet(page);
  await confirmFullPayment(page);
  await expect(page.getByRole("heading", { name: "Pagar fatura" })).not.toBeVisible({ timeout: 10000 });
  await expectJournal(id, "POST", "/cards/statements/stmt-1/pay", 200);

  // Reload: statement status comes back from the fixture as paid.
  await page.reload();
  await page.waitForLoadState("networkidle");
  await expect(page.getByText("Nubank").first()).toBeVisible({ timeout: 10000 });
  await page.getByText("Nubank").first().click();

  // History shows the "Paga" badge and the pay CTA is disabled for it.
  await expect(page.getByText("Paga").first()).toBeVisible({ timeout: 10000 });
  await expect(page.getByRole("button", { name: "Pagar fatura", exact: true })).toBeDisabled();

  assertNoUndeclaredFailures(guard);
});
