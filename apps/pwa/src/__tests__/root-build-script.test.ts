import fs from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";

it("delegates root PWA build to Cloudflare webpack build", () => {
  const root = path.resolve(__dirname, "../../../../package.json");
  const scripts = JSON.parse(fs.readFileSync(root, "utf8")).scripts;

  expect(scripts["build:pwa"]).toBe("pnpm --filter pwa build:cloudflare");
});
