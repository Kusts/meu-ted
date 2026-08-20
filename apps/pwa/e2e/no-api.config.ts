import path from "node:path";
import { defineConfig } from "@playwright/test";

const root = path.resolve(__dirname, "..");

export default defineConfig({
  testDir: ".",
  testMatch: "specs/no-api.spec.ts",
  timeout: 45000,
  workers: 1,
  retries: 0,
  use: {
    baseURL: "http://127.0.0.1:3000",
    headless: true,
    serviceWorkers: "block",
    viewport: { width: 390, height: 844 },
  },
  webServer: [
    {
      command: "pnpm build:next:cloudflare && node e2e/start-standalone.mjs --port 3001",
      port: 3001,
      cwd: root,
      timeout: 300000,
      reuseExistingServer: false,
      env: { ...process.env, NEXT_PUBLIC_PI_FINANCE_API_BASE_URL: "" },
    },
    {
      command: "pnpm exec tsx e2e/sw-harness/server.ts --target=3001 --port=3000",
      port: 3000,
      cwd: root,
      timeout: 15000,
      reuseExistingServer: false,
    },
  ],
});
