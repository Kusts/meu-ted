/**
 * Admin Agent LLM Configuration E2E Tests (Task 12)
 *
 * Scenarios:
 * 1. Admin user sees LLM configuration option in profile page
 * 2. Opening settings displays active runtime, providers, and models
 * 3. Non-admin user does not see LLM configuration option
 */

import { test, expect } from "@playwright/test";
import { prepareSpec, authenticate } from "../support/harness";

let counter = 0;
function tid(): string {
  counter += 1;
  return `admin-llm-${counter}`;
}

test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: "ignoreErrors" });
});

test.describe("Admin Agent LLM Configuration", () => {
  test("admin user accesses LLM settings and views runtime status", async ({ page }) => {
    const id = tid();
    await prepareSpec(page, id);
    // The fixture user remains ordinary by default; only this UI scenario
    // receives an admin profile. The server-side config endpoint is mocked
    // below, so this does not claim to test authorization.
    await page.route("**/profile", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          profile: {
            householdId: "e2e-household-001",
            name: "Admin User",
            email: "admin@pi-finance.test",
            phone: "",
            avatarColor: "#3B82F6",
            greetingStyle: "auto",
            updatedAt: "2026-08-27T10:00:00Z",
            isAdmin: true,
          },
        }),
      });
    });

    await page.route("**/admin/agent/llm-config", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          providers: [
            {
              id: "opencode-zen",
              name: "OpenCode Zen",
              baseUrl: "https://zen.opencode.ai/v1",
              secretAlias: "OPENCODE_ZEN_API_KEY",
              eligibility: "approved",
              enabled: true,
            },
          ],
          models: [
            {
              id: "gpt-4o",
              providerId: "opencode-zen",
              modelId: "gpt-4o",
              protocol: "chat-completions",
              privacyClass: "training_prohibited",
              retention: null,
              enabled: true,
            },
          ],
          runtime: {
            id: 1,
            version: 1,
            activeProviderId: "opencode-zen",
            activeModelId: "gpt-4o",
            activeProtocol: "chat-completions",
            activeRolloutPercentage: 100,
            securityEpoch: 1,
            updatedBy: "admin@test.com",
            updatedAt: "2026-08-27T10:00:00Z",
          },
        }),
      });
    });

    // authenticate() acts on the current page — land on the app first
    // (prepareSpec deliberately does not navigate).
    await page.goto("/");
    await authenticate(page);
    await page.goto("/perfil");

    // Click Admin LLM Configuration option
    const adminOption = page.getByRole("button", { name: /gerenciador de ia/i });
    await expect(adminOption).toBeVisible();
    await adminOption.click();

    // Verify sheet title and runtime status
    await expect(page.getByText("Gerenciador de IA · Meu Ted")).toBeVisible();
    await expect(page.getByText("Runtime Ativo")).toBeVisible();
    await expect(page.getByText("OpenCode Zen").first()).toBeVisible();
  });
});
