import { test, expect } from "@playwright/test";
import { allowFailure, assertNoUndeclaredFailures } from "../support/failure-guard";
import { initSpec } from "../support/harness";

// NOAPI-* — privacy boundary: when the backend is unreachable, a write must
// never be rendered optimistically and must never persist.
//
// Replaces the legacy "Dados financeiros indisponíveis" selector (removed UX).
// The invariant is proven deterministically by aborting the create-transaction
// request at the network layer and asserting the draft is not shown as saved
// anywhere in the transaction list.

let counter = 0;
function tid(): string {
  counter += 1;
  return `noapi-${counter}`;
}

async function init(page: import("@playwright/test").Page, id: string) {
  const guard = await initSpec(page, id, {
    baselineAllows: false,
    allow: [{ message: "reading 'waiting'", reason: "SW blocked" }],
  });
  return guard;
}

test("[NOAPI-01] no API rejects write before optimistic success", async ({ page }) => {
  const id = tid();
  const guard = await init(page, id);
  // Backend unreachable: abort the create-transaction request. The abort is
  // intentional; the failure-guard must tolerate the resulting console error
  // AND the request-failure (URL-filtered) it produces.
  await page.route("**/transactions/expense", (route) => route.abort("connectionfailed"));
  allowFailure(guard, { message: "net::ERR_CONNECTION_FAILED", reason: "intentional no-API abort" });
  allowFailure(guard, { message: "ERR_CONNECTION_FAILED", reason: "intentional no-API abort" });
  allowFailure(guard, { message: "Failed to load resource", reason: "intentional no-API abort" });
  allowFailure(guard, { url: "transactions/expense", reason: "intentional no-API abort" });

  await page.getByLabel("Nova transação").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  await dialog.getByPlaceholder("0,00").fill("5000");
  await dialog.getByPlaceholder("Ex: Aluguel, mercado...").fill("Não deve salvar");
  await dialog.getByRole("button", { name: /^Salvar$/ }).click();

  // The draft must NOT be rendered as a persisted transaction anywhere.
  await expect(page.getByText("Não deve salvar")).toHaveCount(0);
  await expect(dialog).toBeVisible();
  assertNoUndeclaredFailures(guard);
});
