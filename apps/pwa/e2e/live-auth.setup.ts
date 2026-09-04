/**
 * Live auth setup — generates storageState for admin and user.
 * Runs once per worker, then specs reuse state instead of logging in 22×.
 * Opt-in only: PWA_LIVE_E2E=1
 * Credentials never committed: reads PWA_LIVE_* env.
 *
 * Produces:
 *   e2e/.auth/admin.json
 *   e2e/.auth/user.json
 */
import { test as setup, expect } from "@playwright/test";
import { loginViaUI } from "./helpers/live-auth";
import path from "node:path";
import fs from "node:fs";

const LIVE = process.env.PWA_LIVE_E2E === "1";
const ADMIN_EMAIL = process.env.PWA_LIVE_ADMIN_EMAIL || "";
const ADMIN_PASSWORD = process.env.PWA_LIVE_ADMIN_PASSWORD || "";
const USER_EMAIL = process.env.PWA_LIVE_USER_EMAIL || "";
const USER_PASSWORD = process.env.PWA_LIVE_USER_PASSWORD || "";

const ADMIN_STATE = path.resolve(__dirname, ".auth/admin.json");
const USER_STATE = path.resolve(__dirname, ".auth/user.json");

setup.describe.configure({ mode: "serial" });

setup.skip(!LIVE, "Opt-in only — set PWA_LIVE_E2E=1 to generate storageState");
setup.skip(
  !ADMIN_EMAIL || !ADMIN_PASSWORD || !USER_EMAIL || !USER_PASSWORD,
  "Live credentials not provided via env — skip setup"
);

setup("authenticate admin → storageState", async ({ page }) => {
  await loginViaUI(page, ADMIN_EMAIL, ADMIN_PASSWORD);
  await expect(page.getByRole("button", { name: /Abrir perfil/i })).toBeVisible({ timeout: 15000 });
  // Verify token present before saving
  const token = await page.evaluate(() => localStorage.getItem("pi-finance:token"));
  expect(token, "admin device token must be stored").toBeTruthy();
  await fs.promises.mkdir(path.dirname(ADMIN_STATE), { recursive: true });
  await page.context().storageState({ path: ADMIN_STATE });
});

setup("authenticate user → storageState", async ({ page }) => {
  await loginViaUI(page, USER_EMAIL, USER_PASSWORD);
  await expect(page.getByRole("button", { name: /Abrir perfil/i })).toBeVisible({ timeout: 15000 });
  const token = await page.evaluate(() => localStorage.getItem("pi-finance:token"));
  expect(token, "user device token must be stored").toBeTruthy();
  await fs.promises.mkdir(path.dirname(USER_STATE), { recursive: true });
  await page.context().storageState({ path: USER_STATE });
});
