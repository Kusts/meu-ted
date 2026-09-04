/**
 * Live auth helpers — storageState + robust selectors.
 * Never commits credentials; reads from PWA_LIVE_* env.
 * Reduces logins from 22 to 2 per run, mitigating 429 rate-limit.
 */
import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import path from "node:path";

export const ADMIN_STATE_PATH = path.resolve(__dirname, "../.auth/admin.json");
export const USER_STATE_PATH = path.resolve(__dirname, "../.auth/user.json");

export const ADMIN_EMAIL = process.env.PWA_LIVE_ADMIN_EMAIL || "";
export const ADMIN_PASSWORD = process.env.PWA_LIVE_ADMIN_PASSWORD || "";
export const USER_EMAIL = process.env.PWA_LIVE_USER_EMAIL || "";
export const USER_PASSWORD = process.env.PWA_LIVE_USER_PASSWORD || "";

export const LIVE = process.env.PWA_LIVE_E2E === "1";

/** Robust AuthGate selectors — prefer stable id/placeholder, fallback to label. */
export async function fillLoginForm(page: Page, email: string, password: string) {
  // Try id selector first (most stable), then label, then placeholder
  const emailLocator =
    (await page.locator("#email").count()) > 0
      ? page.locator("#email")
      : page.getByLabel("E-mail");
  const passwordLocator =
    (await page.locator("#password").count()) > 0
      ? page.locator("#password")
      : page.getByLabel("Senha");

  const emailInput = page.getByLabel("E-mail", { exact: true }).or(page.locator("#email")).or(page.getByPlaceholder("seu.email@exemplo.com"));
  const passwordInput = page.getByLabel("Senha", { exact: true }).or(page.locator("#password")).or(page.getByPlaceholder("••••••••"));

  await expect(emailInput.first()).toBeVisible({ timeout: 15000 });
  await expect(passwordInput.first()).toBeVisible({ timeout: 15000 });

  await emailInput.first().fill(email);
  await passwordInput.first().fill(password);
}

/** Resilient login — fills form, clicks Entrar, waits for authenticated shell. */
export async function loginViaUI(page: Page, email: string, password: string) {
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const submit = page.getByRole("button", { name: "Entrar" });

    await fillLoginForm(page, email, password);
    await submit.click();

    try {
      await expect(page.getByRole("button", { name: /Abrir perfil/i })).toBeVisible({
        timeout: 20000,
      });
      return;
    } catch (e) {
      const bodyText = await page.locator("body").innerText().catch(() => "");
      const isRateLimited = /Too many requests|429|tente novamente|aguarde/i.test(bodyText);
      if (isRateLimited && attempt < 2) {
        await page.waitForTimeout(2500 + attempt * 1500);
        continue;
      }
      if (attempt === 2) throw e;
      await page.waitForTimeout(1000);
    }
  }
}

/** Ensure the page is authenticated; if not, perform login. Used in setup. */
export async function ensureAuthenticated(page: Page, email: string, password: string) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const alreadyAuth = await page
    .getByRole("button", { name: /Abrir perfil/i })
    .isVisible()
    .catch(() => false);
  if (alreadyAuth) return;
  await loginViaUI(page, email, password);
}
