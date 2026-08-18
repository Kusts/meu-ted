/**
 * Shared HTTP primitive — zero dependencies, safe for both app and SW.
 * All fetch() calls in the project MUST go through this module or
 * its re-exports in client.ts (apiFetch, appFetch).
 *
 * Rationale: Service Workers run in ServiceWorkerGlobalScope and
 * cannot import modules that reference `window` or `localStorage`.
 * This module is the single canonical fetch() surface for the project.
 */

/**
 * Canonical fetch wrapper. Every HTTP call in the project MUST use
 * this or a function that wraps it (apiFetch, appFetch, swFetch).
 */
export const DEFAULT_FETCH_TIMEOUT_MS = 10_000;

export function rawFetch(input: RequestInfo, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const callerSignal = init.signal;
  const abortFromCaller = () => controller.abort(callerSignal?.reason);
  if (callerSignal?.aborted) abortFromCaller();
  else callerSignal?.addEventListener("abort", abortFromCaller, { once: true });

  const timeoutId = setTimeout(
    () => controller.abort(new Error("HTTP request timed out")),
    DEFAULT_FETCH_TIMEOUT_MS,
  );
  return fetch(input, { ...init, signal: controller.signal }).finally(() => {
    clearTimeout(timeoutId);
    callerSignal?.removeEventListener("abort", abortFromCaller);
  });
}
