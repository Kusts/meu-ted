import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const config = readFileSync(path.resolve(process.cwd(), "vitest.config.ts"), "utf8");

describe("vitest coverage config contract (P2-11)", () => {
  it("covers the whole production source tree instead of a frozen commit-range list", () => {
    expect(config).toContain('include: ["src/**"]');
    expect(config).not.toContain("CHANGED_PRODUCTION");
  });

  it("uses global (not per-file) calibrated thresholds", () => {
    expect(config).not.toContain("perFile: true");
    expect(config).toContain("statements: 80");
    expect(config).toContain("branches: 72");
    expect(config).toContain("functions: 80");
    expect(config).toContain("lines: 83");
  });

  it("keeps proportionate route-wrapper exclusions", () => {
    expect(config).toContain('"src/app/**/page.tsx"');
    expect(config).toContain('"src/app/layout.tsx"');
    expect(config).toContain('"src/app/manifest.ts"');
  });
});