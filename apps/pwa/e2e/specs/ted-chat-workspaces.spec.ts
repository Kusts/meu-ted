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

// Cross-origin mocked API responses must carry CORS headers: the app calls
// the absolute fixture origin with credentials:include, so a fulfill without
// ACAO + ACA-Credentials is rejected by the browser (Failed to fetch).
const MOCK_CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "http://127.0.0.1:3000",
  "Access-Control-Allow-Credentials": "true",
};

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
        headers: MOCK_CORS_HEADERS,
        body: JSON.stringify({ token: "mock-token", expiresIn: 90 }),
      });
    });

    // T4.3 (SPEC section 11 E4): the retired legacy agent route mock was
    // removed with the route itself — the app only calls the canonical
    // FinanceChatAgent surface (see fetchAgentHistory mock below). The chat
    // turn is fulfilled on the canonical POST route.
    await page.route("**/finance-chat-agent/**/rpc/chat", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          headers: MOCK_CORS_HEADERS,
          body: JSON.stringify({ turnId: "turn-1", status: "completed", output: "Olá! Como posso ajudar você com suas finanças?" }),
        });
      }
    });

    // Chat history lives under /agents/finance-chat-agent/**/rpc/history
    // (see fetchAgentHistory), not /message — without this mock the history
    // GET 404s, the input stays gated and fill() times out.
    await page.route("**/finance-chat-agent/**/rpc/history*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: MOCK_CORS_HEADERS,
        body: JSON.stringify({ items: [], total: 0 }),
      });
    });

    await page.route("**/pending-operations*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: MOCK_CORS_HEADERS,
        body: JSON.stringify({ items: [], total: 0 }),
      });
    });

    // authenticate() acts on the current page — land on the app first
    // (prepareSpec deliberately does not navigate).
    await page.goto("/");
    await authenticate(page);

    // Check launcher button is visible. Two buttons share the aria-label
    // (hero icon first, floating pill last) — take the floating one.
    const launcher = page.getByRole("button", { name: /abrir assistente ted/i }).last();
    await expect(launcher).toBeVisible();

    // Click launcher to open chat
    await launcher.click();
    const dialog = page.getByRole("dialog", { name: /chat com ted/i });
    await expect(dialog).toBeVisible();

    // Send a message
    // Placeholder in the product is "Mensagem para o assistente".
    const input = page.getByPlaceholder("Mensagem para o assistente");
    await input.fill("Quanto gastei hoje?");
    await page.getByRole("button", { name: /enviar mensagem/i }).click();

    // Verify response
    await expect(page.getByText("Olá! Como posso ajudar você com suas finanças?")).toBeVisible();

    // Close chat with close button
    await page.getByRole("button", { name: /fechar chat/i }).click();
    await expect(dialog).not.toBeVisible();
  });
});
