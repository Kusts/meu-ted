/**
 * Client command ID lifecycle — V4.1 Tasks 3.8-3.9 (SPEC §10.5).
 *
 * The idempotency key is a per-INTENT command id, not a per-HTTP-attempt id:
 *
 * - created ONCE at the intent boundary (the commands layer stamps it onto
 *   the logical command before the first attempt — Task 3.8);
 * - preserved across retry / timeout / reconnect / unknown response
 *   (Task 3.9): a retryable failure reuses the same id, so the server
 *   replays the original receipt instead of executing a second effect;
 * - a NEW id is minted only after a definitive result or for a new user
 *   intent.
 *
 * Retry policy: network drops, timeouts (ApiError 408 / `network.timeout`)
 * and 5xx are retryable with the same id. Definitive 4xx rejections are
 * never blind-retried. A 409 conflict is the replay signal — the server
 * already holds the original receipt under this id — so it is surfaced to
 * the caller (existing ApiError handling) instead of being retried.
 */

import { ApiError } from "./client";

/** Bounded automatic-retry budget: initial attempt + one retry, same id. */
export const MAX_COMMAND_ATTEMPTS = 2;

/** Mints a fresh command id (UUID v4 when crypto is available). */
export function newCommandId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `pwa-${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Attaches a command id to a logical mutation command. A caller-provided id
 * wins (returned by reference, verbatim); otherwise a shallow copy carrying
 * a fresh id is returned and the caller's object is left untouched — the id
 * belongs to the intent, so re-stamping the same intent object is a no-op.
 */
export function ensureCommandId<T extends object>(
  input: T & { idempotencyKey?: string },
): T & { idempotencyKey: string } {
  if (input.idempotencyKey !== undefined) return input as T & { idempotencyKey: string };
  return { ...input, idempotencyKey: newCommandId() };
}

/**
 * Whether a failed mutation attempt may be retried with the SAME command id.
 * Retryable = unknown outcome (network drop, timeout, 5xx): replaying the
 * id is safe because the server dedupes by key. Definitive rejections
 * (any 4xx, including the 409 replay signal) and caller-initiated aborts
 * must not be retried.
 */
export function isRetryableMutationError(err: unknown): boolean {
  if (err instanceof ApiError) {
    if (err.status === 408 || err.code === "network.timeout") return true;
    if (err.status >= 500 && err.status <= 599) return true;
    return false;
  }
  if (err instanceof DOMException && err.name === "AbortError") return false;
  return true;
}

/** 409 = the server already holds the original receipt for this command id. */
export function isIdempotencyConflict(err: unknown): boolean {
  return err instanceof ApiError && err.status === 409;
}

export interface RetryCommandOptions {
  /** Reuse an existing intent id instead of minting one. */
  commandId?: string;
  /** Total attempts including the first (default MAX_COMMAND_ATTEMPTS). */
  maxAttempts?: number;
  /** Override for the default retry policy (receives error + 1-based attempt). */
  shouldRetry?: (err: unknown, attempt: number) => boolean;
}

export interface RetryCommandResult<T> {
  result: T;
  commandId: string;
  attempts: number;
}

/**
 * Executes a mutation attempt function, creating the command id ONCE and
 * reusing it on every automatic retry. Stops (no retry) on definitive
 * rejections and 409 conflicts; gives up after `maxAttempts`, rethrowing
 * the last error so existing error handling (write-error banner, manual
 * retry as a NEW intent) applies unchanged.
 */
export async function retryMutationWithSameCommandId<T>(
  attempt: (commandId: string) => Promise<T>,
  options: RetryCommandOptions = {},
): Promise<RetryCommandResult<T>> {
  const commandId = options.commandId ?? newCommandId();
  const maxAttempts = Math.max(1, options.maxAttempts ?? MAX_COMMAND_ATTEMPTS);
  const shouldRetry = options.shouldRetry ?? isRetryableMutationError;

  let lastError: unknown;
  for (let n = 1; n <= maxAttempts; n += 1) {
    try {
      const result = await attempt(commandId);
      return { result, commandId, attempts: n };
    } catch (err) {
      lastError = err;
      if (isIdempotencyConflict(err)) throw err;
      if (n >= maxAttempts || !shouldRetry(err, n)) throw err;
    }
  }
  throw lastError;
}
