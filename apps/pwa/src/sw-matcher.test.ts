import { describe, it, expect } from "vitest";
import { isShellRoute, matchRequest, type RequestInfo } from "./sw-matcher";

const ORIGIN = "http://localhost:3000";
const nav = (url: string, o: Partial<RequestInfo> = {}): RequestInfo => ({
  url,
  method: "GET",
  mode: "same-origin",
  ...o,
});

describe("isShellRoute", () => {
  it("returns true for shell routes", () => {
    expect(isShellRoute("/registros")).toBe(true);
    expect(isShellRoute("/")).toBe(true);
    expect(isShellRoute("/cartoes")).toBe(true);
  });
  it("returns false for non-shell routes", () => {
    expect(isShellRoute("/foo")).toBe(false);
    expect(isShellRoute("/api/x")).toBe(false);
  });
});

describe("matchRequest edge branches", () => {
  it("rejects .html route pages (non offline-shell)", () => {
    expect(matchRequest(nav(`${ORIGIN}/some-page.html`)).permit).toBe(false);
  });
  it("rejects offline-shell.html via unsupported same-origin", () => {
    // endsWith .html but includes offline-shell -> falls through to unsupported
    const r = matchRequest(nav(`${ORIGIN}/offline-shell.html`));
    expect(r.permit).toBe(false);
  });
  it("rejects response Authorization header (uppercase)", () => {
    expect(
      matchRequest(nav(`${ORIGIN}/data`, { responseHeaders: { Authorization: "Bearer x" } })).permit,
    ).toBe(false);
  });
  it("rejects response authorization header (lowercase)", () => {
    expect(
      matchRequest(nav(`${ORIGIN}/data`, { responseHeaders: { authorization: "Bearer x" } })).permit,
    ).toBe(false);
  });
  it("rejects _next/data route", () => {
    expect(matchRequest(nav(`${ORIGIN}/_next/data/build/r.json`)).permit).toBe(false);
  });
});
