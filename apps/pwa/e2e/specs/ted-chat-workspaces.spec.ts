/**
 * TED Chat & Workspaces E2E Tests (Task 12)
 *
 * Scenarios:
 * 1. Open TED Chat via floating launcher
 * 2. Send message and view streaming / response
 * 3. Switch workspace and verify context updates
 * 4. Close chat with Escape or close button
 */

import { test, expect } from "@playwright/test";
import { prepareSpec, authenticate } from "../support/harness";

let counter = 0;
function tid(): string {
  counter += 1;
  return `ted-${counter}`;
}

test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: "ignoreErrors" });
});

test.describe("TED Chat & Workspaces", () => {
  test("opens TED chat launcher, displays conversation interface and allows sending messages", async ({ page }) => {
    const id = tid();
    await prepareSpec(page, id, {
      authenticatedUser: {
        id: "usr-ted-1",
        email: "user@pi-finance.test",
        name: "Test User",
      },
    });

    await page.route("**/auth/agent-token", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ token: "mock-token", expiresIn: 90 }),
      });
    });

    await page.route("**/agents/workspace/**/message", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ items: [] }),
        });
      } else if (route.request().method() === "POST") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ turnId: "turn-1", status: "completed", output: "Olá! Como posso ajudar você com suas finanças?" }),
        });
      }
    });

    await page.route("**/pending-operations*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items: [], total: 0 }),
      });
    });

    await authenticate(page, id);
    await page.goto("/");

    // Check launcher button is visible
    const launcher = page.getByRole("button", { name: /abrir assistente ted/i });
    await expect(launcher).toBeVisible();

    // Click launcher to open chat
    await launcher.click();
    const dialog = page.getByRole("dialog", { name: /chat com ted/i });
    await expect(dialog).toBeVisible();

    // Send a message
    const input = page.getByPlaceholderText("Digite sua mensagem para o TED…");
    await input.fill("Quanto gastei hoje?");
    await page.getByRole("button", { name: /enviar mensagem/i }).click();

    // Verify response
    await expect(page.getByText("Olá! Como posso ajudar você com suas finanças?")).toBeVisible();

    // Close chat with close button
    await page.getByRole("button", { name: /fechar chat/i }).click();
    await expect(dialog).not.toBeVisible();
  });
});
