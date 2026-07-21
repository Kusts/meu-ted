/**
 * Unit tests for the failure guard.
 * Tests the guard in isolation (no Playwright dependency).
 */

import { describe, it, expect } from "vitest";
import {
  createGuard,
  onConsoleMessage,
  onPageError,
  onRequestFailed,
  onResponse,
  allowFailure,
  assertNoUndeclaredFailures,
} from "./failure-guard";

// ── Console errors ───────────────────────────────────────────────────────────

describe("console error detection", () => {
  it("rejects undeclared CSP violation via assertNoUndeclaredFailures", () => {
    const guard = createGuard();
    onConsoleMessage(guard, { type: "error", text: "Content Security Policy violation" });
    expect(() => assertNoUndeclaredFailures(guard)).toThrow("Undeclared console error");
  });

  it("allows declared CSP violation", () => {
    const guard = createGuard();
    allowFailure(guard, { message: "Content Security Policy", reason: "expected CSP test" });
    onConsoleMessage(guard, { type: "error", text: "Content Security Policy violation" });
    expect(() => assertNoUndeclaredFailures(guard)).not.toThrow();
  });

  it("rejects undeclared ChunkLoadError", () => {
    const guard = createGuard();
    onConsoleMessage(guard, {
      type: "error",
      text: "ChunkLoadError: Loading chunk some-chunk failed",
    });
    expect(() => assertNoUndeclaredFailures(guard)).toThrow("Undeclared console error");
  });

  it("allows declared ChunkLoadError", () => {
    const guard = createGuard();
    allowFailure(guard, { message: "ChunkLoadError", reason: "expected chunk error" });
    onConsoleMessage(guard, {
      type: "error",
      text: "ChunkLoadError: Loading chunk some-chunk failed",
    });
    expect(() => assertNoUndeclaredFailures(guard)).not.toThrow();
  });

  it("rejects undeclared generic console.error", () => {
    const guard = createGuard();
    onConsoleMessage(guard, { type: "error", text: "Something bad happened" });
    expect(() => assertNoUndeclaredFailures(guard)).toThrow("Undeclared console error");
  });

  it("allows declared generic console.error by message substring", () => {
    const guard = createGuard();
    allowFailure(guard, { message: "bad happened", reason: "expected" });
    onConsoleMessage(guard, { type: "error", text: "Something bad happened" });
    expect(() => assertNoUndeclaredFailures(guard)).not.toThrow();
  });

  it("ignores console.info, log, and warn", () => {
    const guard = createGuard();
    onConsoleMessage(guard, { type: "info", text: "Some info" });
    onConsoleMessage(guard, { type: "log", text: "Some log" });
    onConsoleMessage(guard, { type: "warning", text: "Some warning" });
    expect(() => assertNoUndeclaredFailures(guard)).not.toThrow();
  });

  it("collects multiple console errors", () => {
    const guard = createGuard();
    onConsoleMessage(guard, { type: "error", text: "Error 1" });
    onConsoleMessage(guard, { type: "error", text: "Error 2" });
    expect(guard.consoleErrors).toHaveLength(2);
  });
});

// ── Page errors ──────────────────────────────────────────────────────────────

describe("page error detection", () => {
  it("rejects undeclared page error", () => {
    const guard = createGuard();
    onPageError(guard, new Error("Unexpected render error"));
    expect(() => assertNoUndeclaredFailures(guard)).toThrow("Undeclared page error");
  });

  it("allows declared page error", () => {
    const guard = createGuard();
    allowFailure(guard, { message: "render error", reason: "expected" });
    onPageError(guard, new Error("Unexpected render error"));
    expect(() => assertNoUndeclaredFailures(guard)).not.toThrow();
  });
});

// ── Request failures ─────────────────────────────────────────────────────────

describe("request failure detection", () => {
  it("rejects undeclared request failure", () => {
    const guard = createGuard();
    onRequestFailed(guard, {
      url: () => "https://api.example.com/data",
      failure: () => ({ errorText: "net::ERR_CONNECTION_REFUSED" }),
    });
    expect(() => assertNoUndeclaredFailures(guard)).toThrow("Undeclared request failure");
  });

  it("allows declared request failure by URL substring", () => {
    const guard = createGuard();
    allowFailure(guard, { url: "api.example.com", reason: "expected offline" });
    onRequestFailed(guard, {
      url: () => "https://api.example.com/data",
      failure: () => ({ errorText: "net::ERR_CONNECTION_REFUSED" }),
    });
    expect(() => assertNoUndeclaredFailures(guard)).not.toThrow();
  });

  it("ignores request with no failure object", () => {
    const guard = createGuard();
    onRequestFailed(guard, {
      url: () => "https://example.com/data",
      failure: () => null,
    });
    expect(guard.requestFailures).toHaveLength(0);
    expect(() => assertNoUndeclaredFailures(guard)).not.toThrow();
  });
});

// ── HTTP response failures ───────────────────────────────────────────────────

describe("HTTP response >=400 detection", () => {
  it("rejects undeclared 500 response", () => {
    const guard = createGuard();
    onResponse(guard, { status: () => 500, url: () => "https://example.com/data" });
    expect(() => assertNoUndeclaredFailures(guard)).toThrow("Undeclared HTTP 500 response");
  });

  it("rejects undeclared 404 response", () => {
    const guard = createGuard();
    onResponse(guard, { status: () => 404, url: () => "https://example.com/notfound" });
    expect(() => assertNoUndeclaredFailures(guard)).toThrow("Undeclared HTTP 404 response");
  });

  it("ignores 2xx and 3xx responses", () => {
    const guard = createGuard();
    onResponse(guard, { status: () => 200, url: () => "https://example.com/ok" });
    onResponse(guard, { status: () => 301, url: () => "https://example.com/redirect" });
    expect(guard.responseFailures).toHaveLength(0);
    expect(() => assertNoUndeclaredFailures(guard)).not.toThrow();
  });

  it("allows declared HTTP error by status", () => {
    const guard = createGuard();
    allowFailure(guard, { status: 500, reason: "expected server error" });
    onResponse(guard, { status: () => 500, url: () => "https://example.com/data" });
    expect(() => assertNoUndeclaredFailures(guard)).not.toThrow();
  });

  it("allows declared HTTP error by URL", () => {
    const guard = createGuard();
    allowFailure(guard, { url: "example.com/fail", reason: "expected" });
    onResponse(guard, { status: () => 503, url: () => "https://example.com/fail" });
    expect(() => assertNoUndeclaredFailures(guard)).not.toThrow();
  });
});

// ── Mixed scenarios ──────────────────────────────────────────────────────────

describe("mixed guards", () => {
  it("passes when all errors are declared", () => {
    const guard = createGuard();
    allowFailure(guard, { message: "Content Security Policy", reason: "expected" });
    allowFailure(guard, { status: 500, reason: "expected" });
    allowFailure(guard, { url: "api.example.com", reason: "expected" });

    onConsoleMessage(guard, { type: "error", text: "Content Security Policy violation" });
    onResponse(guard, { status: () => 500, url: () => "https://api.example.com/data" });
    onRequestFailed(guard, {
      url: () => "https://api.example.com/data",
      failure: () => ({ errorText: "net::ERR_FAILED" }),
    });

    expect(() => assertNoUndeclaredFailures(guard)).not.toThrow();
  });

  it("fails on first undeclared error when mixing declared and undeclared", () => {
    const guard = createGuard();
    allowFailure(guard, { message: "Content Security Policy", reason: "expected" });

    onConsoleMessage(guard, { type: "error", text: "Content Security Policy violation" });
    onConsoleMessage(guard, { type: "error", text: "Unexpected runtime error" });

    expect(() => assertNoUndeclaredFailures(guard)).toThrow("Unexpected runtime error");
  });
});

// ── Guard invariants ─────────────────────────────────────────────────────────

describe("guard invariants", () => {
  it("new guard has zero errors and zero allowances", () => {
    const guard = createGuard();
    expect(guard.consoleErrors).toHaveLength(0);
    expect(guard.pageErrors).toHaveLength(0);
    expect(guard.requestFailures).toHaveLength(0);
    expect(guard.responseFailures).toHaveLength(0);
    expect(guard.allowances).toHaveLength(0);
  });

  it("assertNoUndeclaredFailures passes on clean guard", () => {
    const guard = createGuard();
    expect(() => assertNoUndeclaredFailures(guard)).not.toThrow();
  });

  it("allowFailure requires a reason", () => {
    const guard = createGuard();
    expect(() => allowFailure(guard, { message: "x" } as never)).toThrow("requires a `reason`");
  });
});
