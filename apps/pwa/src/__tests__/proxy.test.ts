import { describe, it, expect } from "vitest";
import {
  generateNonce,
  SECURITY_HEADERS,
  buildCspValue,
  PRODUCTION_API_ORIGIN,
} from "../proxy-utils";

describe("generateNonce", () => {
  it("returns a 32-character hex string", () => {
    const nonce = generateNonce();
    expect(nonce).toMatch(/^[0-9a-f]{32}$/);
  });

  it("returns unique values on successive calls", () => {
    const a = generateNonce();
    const b = generateNonce();
    expect(a).not.toBe(b);
  });
});

describe("SECURITY_HEADERS", () => {
  it("includes Strict-Transport-Security with max-age and includeSubDomains", () => {
    expect(SECURITY_HEADERS["Strict-Transport-Security"]).toBe(
      "max-age=31536000; includeSubDomains",
    );
  });

  it("includes X-Content-Type-Options: nosniff", () => {
    expect(SECURITY_HEADERS["X-Content-Type-Options"]).toBe("nosniff");
  });

  it("includes Referrer-Policy: strict-origin-when-cross-origin", () => {
    expect(SECURITY_HEADERS["Referrer-Policy"]).toBe(
      "strict-origin-when-cross-origin",
    );
  });

  it("includes Permissions-Policy denying camera, microphone, geolocation", () => {
    expect(SECURITY_HEADERS["Permissions-Policy"]).toBe(
      "camera=(), microphone=(), geolocation=()",
    );
  });

  it("includes X-Frame-Options: DENY", () => {
    expect(SECURITY_HEADERS["X-Frame-Options"]).toBe("DENY");
  });
});

describe("buildCspValue", () => {
  const nonce = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4";

  it("allows same-origin Next route chunks with the request nonce", () => {
    const csp = buildCspValue(nonce);
    expect(csp).toContain(`script-src 'self' 'nonce-${nonce}'`);
  });

  it("includes connect-src with self and production API", () => {
    const csp = buildCspValue(nonce);
    expect(csp).toContain("connect-src");
    expect(csp).toContain("'self'");
    expect(csp).toContain(PRODUCTION_API_ORIGIN);
  });

  it("allows same-origin stylesheet assets and Tailwind inline styles", () => {
    const csp = buildCspValue(nonce);
    expect(csp).toContain("style-src 'self' 'unsafe-inline'");
  });

  it("allows the same-origin service worker", () => {
    const csp = buildCspValue(nonce);
    expect(csp).toContain("worker-src 'self'");
  });

  it("sets frame-ancestors 'none' (equivalent to X-Frame-Options DENY)", () => {
    const csp = buildCspValue(nonce);
    expect(csp).toContain("frame-ancestors 'none'");
  });
});

describe("PRODUCTION_API_ORIGIN", () => {
  it("is the canonical production API URL", () => {
    expect(PRODUCTION_API_ORIGIN).toBe("https://api.synkroo.com.br");
  });
});
