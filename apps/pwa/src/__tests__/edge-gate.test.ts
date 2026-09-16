import { describe, expect, it } from "vitest";
import {
  PRODUCTION_PWA_ORIGIN,
  buildCspValue,
  isBrowserOriginAllowed,
  isLocalBypassEnabled,
  isLocalOrigin,
  resolveForwardOrigin,
} from "../proxy-utils";

const PROD_ENV = { NODE_ENV: "production", ALLOW_LOCAL_ORIGIN: "1" };
const PROD_ENV_NO_FLAG = { NODE_ENV: "production" };
const DEV_ENV = { NODE_ENV: "development", ALLOW_LOCAL_ORIGIN: "1" };
const DEV_ENV_NO_FLAG = { NODE_ENV: "development" };

describe("isLocalOrigin", () => {
  it("matches localhost and 127.0.0.1 over http and https", () => {
    expect(isLocalOrigin("http://localhost:3000")).toBe(true);
    expect(isLocalOrigin("https://localhost:3000")).toBe(true);
    expect(isLocalOrigin("http://127.0.0.1:3001")).toBe(true);
    expect(isLocalOrigin("https://127.0.0.1:3001")).toBe(true);
  });

  it("rejects non-local and malformed origins", () => {
    expect(isLocalOrigin("https://pwa.example")).toBe(false);
    expect(isLocalOrigin("https://api.synkroo.com.br")).toBe(false);
    expect(isLocalOrigin("http://localhost.evil.example")).toBe(false);
    expect(isLocalOrigin("not-a-url")).toBe(false);
  });
});

describe("isLocalBypassEnabled (V4 T2.7 G3)", () => {
  it("is fail-closed in production even with the explicit flag", () => {
    expect(isLocalBypassEnabled(PROD_ENV)).toBe(false);
    expect(isLocalBypassEnabled(PROD_ENV_NO_FLAG)).toBe(false);
  });

  it("requires the explicit flag outside production", () => {
    expect(isLocalBypassEnabled(DEV_ENV)).toBe(true);
    expect(isLocalBypassEnabled(DEV_ENV_NO_FLAG)).toBe(false);
  });
});

describe("isBrowserOriginAllowed (V4 T2.7 G3)", () => {
  const requestUrl = "https://pwa.example/api/backend/payables";

  it("allows missing origin and same-origin requests", () => {
    expect(isBrowserOriginAllowed(null, requestUrl, PROD_ENV)).toBe(true);
    expect(isBrowserOriginAllowed("https://pwa.example", requestUrl, PROD_ENV)).toBe(true);
  });

  it("rejects localhost in production (flag or not)", () => {
    expect(isBrowserOriginAllowed("http://localhost:3000", requestUrl, PROD_ENV)).toBe(false);
    expect(isBrowserOriginAllowed("http://127.0.0.1:3000", requestUrl, PROD_ENV_NO_FLAG)).toBe(false);
  });

  it("allows localhost only with the explicit dev/test flag", () => {
    expect(isBrowserOriginAllowed("http://localhost:3000", requestUrl, DEV_ENV)).toBe(true);
    expect(isBrowserOriginAllowed("http://localhost:3000", requestUrl, DEV_ENV_NO_FLAG)).toBe(false);
  });

  it("always rejects foreign and malformed origins", () => {
    expect(isBrowserOriginAllowed("https://attacker.example", requestUrl, DEV_ENV)).toBe(false);
    expect(isBrowserOriginAllowed("https://attacker.example", requestUrl, PROD_ENV)).toBe(false);
    expect(isBrowserOriginAllowed("not-a-url", requestUrl, DEV_ENV)).toBe(false);
  });
});

describe("resolveForwardOrigin (V4 T2.7 G3)", () => {
  it("spoofs localhost to the production host only when the bypass is enabled", () => {
    expect(resolveForwardOrigin("http://localhost:3000", DEV_ENV)).toBe(PRODUCTION_PWA_ORIGIN);
    expect(resolveForwardOrigin("http://localhost:3000", PROD_ENV)).toBe("http://localhost:3000");
  });

  it("forwards non-local origins unchanged", () => {
    expect(resolveForwardOrigin("https://pwa.example", DEV_ENV)).toBe("https://pwa.example");
    expect(resolveForwardOrigin(null, DEV_ENV)).toBeNull();
  });
});

describe("production CSP is same-origin only (V4 T2.7 G1/G2)", () => {
  const nonce = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4";

  it("keeps connect-src on 'self' with no external origins", () => {
    const csp = buildCspValue(nonce, false);
    expect(csp).toContain("connect-src 'self'");
    expect(csp).not.toContain("api.synkroo.com.br");
    expect(csp).not.toContain("workers.dev");
  });

  it("adds the hardening directives and the same-origin report target", () => {
    const csp = buildCspValue(nonce, false);
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain("report-uri /api/csp-report");
  });

  it("keeps the development localhost escape hatch gated", () => {
    const dev = buildCspValue(nonce, true);
    expect(dev).toContain("http://localhost:3001");
    expect(dev).toContain("http://127.0.0.1:3001");
  });
});
