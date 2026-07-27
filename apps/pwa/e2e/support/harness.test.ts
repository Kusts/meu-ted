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
