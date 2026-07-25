/**
 * Browser-failure guard for Playwright E2E tests.
 *
 * Usage:
 *   const guard = createGuard();
 *   attachGuard(page, guard);
 *   allowFailure(guard, { message: "expected error", reason: "intentional" });
 *   // ... test actions ...
 *   assertNoUndeclaredFailures(guard); // throws on undeclared failures
 *
 * Covers: console errors, CSP violations, ChunkLoadErrors, page errors,
 * request failures, HTTP >=400 responses.
 *
 * Guard does NOT throw inside event handlers (Playwright swallows them).
 * Instead it collects failures; call assertNoUndeclaredFailures() at the
 * end of the test or in afterEach.
 */

import type { Page } from "@playwright/test";

// ── Types ────────────────────────────────────────────────────────────────────

export interface GuardFailureAllowance {
  /** Allow by message content substring match */
  message?: string;
  /** Allow by URL substring match */
  url?: string;
  /** Allow by HTTP status code */
  status?: number;
  /** Required: reason why this failure is expected */
  reason: string;
}

export interface ConsoleError {
  type: string;
  text: string;
}

export interface ResponseFailure {
  url: string;
  status: number;
}

export interface GuardState {
  allowances: GuardFailureAllowance[];
  consoleErrors: ConsoleError[];
  pageErrors: Error[];
  requestFailures: Array<{ url: string; errorText: string }>;
  responseFailures: ResponseFailure[];
}

// ── Factory ──────────────────────────────────────────────────────────────────

export function createGuard(): GuardState {
  return {
    allowances: [],
    consoleErrors: [],
    pageErrors: [],
    requestFailures: [],
    responseFailures: [],
  };
}

// ── Allowance ────────────────────────────────────────────────────────────────

export function allowFailure(guard: GuardState, allowance: GuardFailureAllowance): void {
  if (!allowance.reason) {
    throw new Error("allowFailure requires a `reason` string");
  }
  guard.allowances.push(allowance);
}

function isAllowed(guard: GuardState, type: "message" | "url" | "status", value: string): boolean {
  return guard.allowances.some((a) => {
    if (type === "message" && a.message !== undefined && value.includes(a.message)) return true;
    if (type === "url" && a.url !== undefined && value.includes(a.url)) return true;
    if (type === "status" && a.status !== undefined && value.includes(String(a.status))) return true;
    return false;
  });
}

// ── Event handlers (collect, never throw) ────────────────────────────────────

export function onConsoleMessage(guard: GuardState, msg: ConsoleError): void {
  if (msg.type !== "error") return;
  guard.consoleErrors.push(msg);
}

export function onPageError(guard: GuardState, error: Error): void {
  guard.pageErrors.push(error);
}

export function onRequestFailed(
  guard: GuardState,
  request: { url: () => string; failure: () => { errorText: string } | null },
): void {
  const url = request.url();
  const failure = request.failure();
  if (failure) {
    guard.requestFailures.push({ url, errorText: failure.errorText });
  }
}

export function onResponse(guard: GuardState, response: { status: () => number; url: () => string }): void {
  const status = response.status();
  if (status >= 400) {
    guard.responseFailures.push({ url: response.url(), status });
  }
}

// ── Assertion (call at end of test) ─────────────────────────────────────────

export function assertNoUndeclaredFailures(guard: GuardState): void {
  for (const err of guard.consoleErrors) {
    if (!isAllowed(guard, "message", err.text)) {
      throw new Error(`Undeclared console error: ${err.text}`);
    }
  }

  for (const err of guard.pageErrors) {
    if (!isAllowed(guard, "message", err.message)) {
      throw new Error(`Undeclared page error: ${err.message}`);
    }
  }

  for (const req of guard.requestFailures) {
    if (!isAllowed(guard, "url", req.url)) {
      throw new Error(`Undeclared request failure: ${req.url} - ${req.errorText}`);
    }
  }

  for (const res of guard.responseFailures) {
    if (!isAllowed(guard, "url", res.url) && !isAllowed(guard, "status", String(res.status))) {
      throw new Error(`Undeclared HTTP ${res.status} response: ${res.url}`);
    }
  }
}

// ── Attach to Playwright page ────────────────────────────────────────────────

export function attachGuard(page: Page, guard: GuardState): void {
  page.on("console", (msg) => {
    onConsoleMessage(guard, { type: msg.type(), text: msg.text() });
  });

  page.on("pageerror", (error) => {
    onPageError(guard, error);
  });

  page.on("requestfailed", (request) => {
    onRequestFailed(guard, request);
  });

  page.on("response", (response) => {
    onResponse(guard, response);
  });
}
