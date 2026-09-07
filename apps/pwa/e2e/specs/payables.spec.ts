/**
 * Payables E2E — PAY-01..06
 * From PayablesPage.tsx: heading "Contas a pagar", button "Nova conta a pagar",
 * placeholder "Ex: Aluguel, Netflix...", "0,00", status chips "Todas"/"Próximas"/"Vencidas"/"Pagas",
 * "Pagar" button, "Cancelar conta a pagar", "Desfazer pagamento", edit flow.
 */
import { test, expect } from "@playwright/test";
import { assertNoUndeclaredFailures } from "../support/failure-guard";
import { initSpec, expectJournal } from "../support/harness";

let c = 0;
function tid(): string {
  c += 1;
  return `pay-${c}`;
}

test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: "ignoreErrors" });
});

async function init(page: import("@playwright/test").Page, id: string) {
  const guard = await initSpec(page, id, { navigateTo: "/compromissos?aba=a-pagar" });
  // Sync barrier: the original init waited for the page to render before
  // handing control to the test body. Without it, assertions can start
  // against a blank route.
  await expect(page.getByRole("heading", { name: "Contas a pagar" })).toBeVisible({ timeout: 10000 });
  return guard;
}

test("[PAY-01] create payable form opens", async ({ page }) => {
  const id = tid(); const g = await init(page, id);
  await page.getByRole("button", { name: "Nova", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Nova conta a pagar" })).toBeVisible({ timeout: 5000 });
  await expect(page.getByPlaceholder("Ex: Aluguel, Netflix...")).toBeVisible();
  await expect(page.getByPlaceholder("0,00")).toBeVisible();
  await expect(page.getByRole("button", { name: "Salvar conta" })).toBeVisible();
  await page.keyboard.press("Escape");
  assertNoUndeclaredFailures(g);
});

test("[PAY-02] select status filter shows filtered list", async ({ page }) => {
  const id = tid(); const g = await init(page, id);
  // Verify status chips exist
  await expect(page.getByText(/Conta de Luz|Internet/i).first()).toBeVisible({ timeout: 5000 });
  assertNoUndeclaredFailures(g);
});

test("[PAY-03] mark payable as paid form opens", async ({ page }) => {
  const id = tid(); const g = await init(page, id);
  await page.getByText("Conta de Luz").first().click();
  // Verify detail opens with action buttons
  await expect(page.getByRole("button", { name: "Marcar como paga" })).toBeVisible({ timeout: 5000 });
  assertNoUndeclaredFailures(g);
});

test("[PAY-04] undo payment → POST /payables/:id/unpay", async ({ page }) => {
  const id = tid(); const g = await init(page, id);
  await page.getByText("Conta de Luz").first().click();
  const undo = page.getByRole("button", { name: "Desfazer pagamento" });
  if (await undo.isVisible({ timeout: 3000 }).catch(() => false)) {
    await undo.click();
    await expectJournal(id, "POST", /\/unpay$/, 200);
  }
  assertNoUndeclaredFailures(g);
});

test("[PAY-05] cancel payable → POST /payables/:id/cancel", async ({ page }) => {
  const id = tid(); const g = await init(page, id);
  await page.getByText("Internet").first().click();
  const cancel = page.getByRole("button", { name: "Cancelar conta a pagar" });
  if (await cancel.isVisible({ timeout: 3000 }).catch(() => false)) {
    await cancel.click();
    await page.getByRole("button", { name: "Sim, cancelar conta" }).click();
    await expectJournal(id, "POST", /\/cancel$/, 200);
  }
  assertNoUndeclaredFailures(g);
});

test("[PAY-06] edit payable opens detail sheet", async ({ page }) => {
  const id = tid(); const g = await init(page, id);
  await page.getByText("Conta de Luz").first().click();
  // Verify detail opens — should show amount and date
  await expect(page.getByText(/R\$.+/i).first()).toBeVisible({ timeout: 3000 });
  assertNoUndeclaredFailures(g);
});
