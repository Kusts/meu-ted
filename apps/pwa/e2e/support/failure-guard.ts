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
  url?: string;
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

function isConsoleAllowed(guard: GuardState, error: ConsoleError): boolean {
  return guard.allowances.some((allowance) => {
    if (allowance.message === undefined || !error.text.includes(allowance.message)) return false;
    return allowance.url === undefined || Boolean(error.url?.includes(allowance.url));
  });
}

function isPageErrorAllowed(guard: GuardState, error: Error): boolean {
  return guard.allowances.some((allowance) =>
    allowance.message !== undefined &&
    allowance.url === undefined &&
    allowance.status === undefined &&
    error.message.includes(allowance.message),
  );
}

function isResponseAllowed(guard: GuardState, response: ResponseFailure): boolean {
  return guard.allowances.some((allowance) => {
    if (allowance.url === undefined && allowance.status === undefined) return false;
    const urlMatches = allowance.url === undefined || response.url.includes(allowance.url);
    const statusMatches = allowance.status === undefined || response.status === allowance.status;
    return urlMatches && statusMatches;
  });
}

function isRequestAllowed(guard: GuardState, url: string): boolean {
  return guard.allowances.some(
    (allowance) =>
      allowance.url !== undefined &&
      allowance.status === undefined &&
      url.includes(allowance.url),
  );
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
  if (!failure) return;
  // An aborted request (net::ERR_ABORTED) is benign by construction: it means
  // the client navigated away and cancelled an in-flight download — the
  // server never saw a failure. Previously scoped to /_next/static/ assets;
  // widened after ACC-05 triage (2026-09-09) showed the same race on API
  // calls (e.g. pending-me aborted by navigation). Real failures (4xx/5xx,
  // DNS, refused) are still recorded.
  if (failure.errorText === "net::ERR_ABORTED") return;
  guard.requestFailures.push({ url, errorText: failure.errorText });
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
    if (!isConsoleAllowed(guard, err)) {
      throw new Error(`Undeclared console error${err.url ? ` at ${err.url}` : ""}: ${err.text}`);
    }
  }

  for (const err of guard.pageErrors) {
    if (!isPageErrorAllowed(guard, err)) {
      throw new Error(`Undeclared page error: ${err.message}`);
    }
  }

  for (const req of guard.requestFailures) {
    if (!isRequestAllowed(guard, req.url)) {
      throw new Error(`Undeclared request failure: ${req.url} - ${req.errorText}`);
    }
  }

  for (const res of guard.responseFailures) {
    if (!isResponseAllowed(guard, res)) {
      throw new Error(`Undeclared HTTP ${res.status} response: ${res.url}`);
    }
  }
}

// ── Attach to Playwright page ────────────────────────────────────────────────

export function attachGuard(page: Page, guard: GuardState): void {
  page.on("console", (msg) => {
    onConsoleMessage(guard, { type: msg.type(), text: msg.text(), url: msg.location().url });
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
