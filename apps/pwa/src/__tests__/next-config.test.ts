import fs from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";

it("enables standalone output required by OpenNext", () => {
  const configPath = path.resolve(__dirname, "../../next.config.ts");
  const config = fs.readFileSync(configPath, "utf8");

  expect(config).toContain('output: "standalone"');
});

it("declares temporary redirects for every absorbed page route (item 13)", async () => {
  const { CANONICAL_REDIRECTS } = await import("@/lib/routes");
  expect(CANONICAL_REDIRECTS.length).toBeGreaterThanOrEqual(12);

  const { default: config } = await import("../../next.config");
  const redirects = await config.redirects?.();
  expect(redirects).toBeDefined();
  expect(redirects).toHaveLength(CANONICAL_REDIRECTS.length);
  for (const redirect of redirects ?? []) {
    expect(redirect.permanent).toBe(false);
    expect(
      CANONICAL_REDIRECTS.some(
        (canonical) =>
          canonical.source === redirect.source &&
          canonical.destination === redirect.destination,
      ),
      `redirect ${redirect.source} matches the canonical table`,
    ).toBe(true);
  }
});
