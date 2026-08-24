/**
 * Unit tests for the E2E harness. Pure functions only — no Playwright runtime.
 */
import { describe, it, expect } from "vitest";
import { rewriteCspForFixture } from "./harness";

describe("rewriteCspForFixture", () => {
  it("prepends the fixture origin to connect-src", () => {
    const input = "default-src 'self'; connect-src 'self' https://api.synkroo.com.br";
    expect(rewriteCspForFixture(input)).toContain(
      "connect-src http://127.0.0.1:4010 'self' https://api.synkroo.com.br",
    );
  });

  it("adds unsafe-eval to script-src", () => {
    const input = "script-src 'self'";
    expect(rewriteCspForFixture(input)).toBe("script-src 'unsafe-eval' 'self'");
  });

  it("returns the policy unchanged when neither directive is present", () => {
    const input = "default-src 'self'";
    expect(rewriteCspForFixture(input)).toBe("default-src 'self'");
  });

  it("rewrites both directives when both are present", () => {
    const input = "connect-src 'self'; script-src 'self'";
    const out = rewriteCspForFixture(input);
    expect(out).toContain("connect-src http://127.0.0.1:4010 'self'");
    expect(out).toContain("script-src 'unsafe-eval' 'self'");
  });
});

// ── Item 0.1 invariant ───────────────────────────────────────────────────────

import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// `__dirname` does not exist in ESM; the PWA package is ESM.
const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * `auth.spec` IS the test of registration, so it cannot delegate to
 * `authenticate()` — it drives the button by design.
 *
 * Merely *asserting* the button is visible is fine anywhere: profile's PROF-06
 * checks that logout returns to the register screen, and production-smoke
 * checks the shell renders. Only *clicking* it performs registration, so that
 * is what this invariant forbids.
 */
const AUTH_BOUNDARY_EXEMPT = new Set(["auth.spec.ts"]);

/** True when the file clicks the Registrar button (same line or shortly after). */
function clicksRegistrar(source: string): boolean {
  const lines = source.split("\n");
  return lines.some((line, i) => {
    if (!line.includes('name: "Registrar"')) return false;
    return lines.slice(i, i + 4).some((l) => l.includes(".click("));
  });
}

describe("auth centralization invariant (plan item 0.1)", () => {
  it("no spec clicks the Registrar button outside authenticate()", () => {
    const dir = join(HERE, "..", "specs");
    const offenders = readdirSync(dir)
      .filter((f) => f.endsWith(".spec.ts") && !AUTH_BOUNDARY_EXEMPT.has(f))
      .filter((f) => clicksRegistrar(readFileSync(join(dir, f), "utf8")));

    expect(offenders).toEqual([]);
  });

  it("harness is the only place that knows how a session starts", () => {
    const src = readFileSync(join(HERE, "harness.ts"), "utf8");
    expect(src.includes('name: "Entrar"') || src.includes('name: "Registrar"')).toBe(true);
  });
});
