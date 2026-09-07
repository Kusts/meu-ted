import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const OUT = path.resolve("docs/design/previews");
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  colorScheme: "dark",
});
await context.addInitScript(() => {
  localStorage.setItem("pi-theme", "dark");
  // Offline unlock: AuthGate falls back to unlocked when a token is stored
  // but verification fails with a network error.
  localStorage.setItem("pi-finance:token", "preview-offline");
  localStorage.setItem("pi-finance:session-token", "preview-offline");
});
const page = await context.newPage();
// Force the offline path: every authoritative call fails at the network layer.
await page.route("**/api/backend/**", (route) => route.abort("connectionfailed"));
await page.route("**/api/agent/**", (route) => route.abort("connectionfailed"));

async function shot(name, setup) {
  if (setup) await setup();
  await page.waitForTimeout(1800);
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  console.log("saved", name, page.url());
}

await page.goto("http://localhost:3000/", { waitUntil: "commit" }).catch(() => undefined);
await page.screenshot({ path: path.join(OUT, "01-splash.png") }).catch(() => undefined);
console.log("saved 01-splash");

await shot("02-home", null);
await shot("03-home-scrolled", () => page.evaluate(() => window.scrollBy(0, 500)));

await page.goto("http://localhost:3000/compromissos", { waitUntil: "domcontentloaded" }).catch(() => undefined);
await shot("04-compromissos", null);
await shot("05-compromissos-scrolled", () => page.evaluate(() => window.scrollBy(0, 400)));

await page.goto("http://localhost:3000/hub/patrimonio", { waitUntil: "domcontentloaded" }).catch(() => undefined);
await shot("06-hub-patrimonio", null);

await page.goto("http://localhost:3000/registros", { waitUntil: "domcontentloaded" }).catch(() => undefined);
await shot("07-registros", null);

await browser.close();
console.log("done", OUT);
