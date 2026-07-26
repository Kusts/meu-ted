import fs from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";

it("enables standalone output required by OpenNext", () => {
  const configPath = path.resolve(__dirname, "../../next.config.ts");
  const config = fs.readFileSync(configPath, "utf8");

  expect(config).toContain('output: "standalone"');
});
