// V4.1 Tasks 3.8-3.10 (SPEC §10.5 Client command ID): the idempotency key is
// a per-INTENT command id, not a per-HTTP-attempt id. Unit contract for the
// command-id module (intent-boundary creation + retry preservation policy).
import { describe, it, expect, vi } from "vitest";
import { ApiError } from "./client";
import {
  newCommandId,
  ensureCommandId,
  isRetryableMutationError,
  isIdempotencyConflict,
  retryMutationWithSameCommandId,
  MAX_COMMAND_ATTEMPTS,
} from "./command-id";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe("command-id — intent-boundary creation (Task 3.8)", () => {
  it("newCommandId mints a valid UUID v4", () => {
    expect(newCommandId()).toMatch(UUID_V4);
  });

  it("two intents get two distinct ids", () => {
    expect(newCommandId()).not.toBe(newCommandId());
  });

  it("ensureCommandId stamps a fresh id when the intent carries none", () => {
    const out = ensureCommandId({ description: "x" });
    expect(out.idempotencyKey).toMatch(UUID_V4);
  });

  it("ensureCommandId never mutates the caller's intent object", () => {
    const input = { description: "x" };
    const out = ensureCommandId(input);
    expect(input).not.toHaveProperty("idempotencyKey");
    expect(out).not.toBe(input);
  });

  it("ensureCommandId preserves a caller-provided id verbatim", () => {
    const input = { description: "x", idempotencyKey: "caller-key-1" };
    const out = ensureCommandId(input);
    expect(out.idempotencyKey).toBe("caller-key-1");
    expect(out).toBe(input);
  });

  it("two retries of one intent share 1 id; two distinct intents get 2 ids", () => {
    const intent = ensureCommandId({ description: "same intent" });
    const retrySameIntent = ensureCommandId(intent);
    expect(retrySameIntent.idempotencyKey).toBe(intent.idempotencyKey);
    const otherIntent = ensureCommandId({ description: "other intent" });
    expect(otherIntent.idempotencyKey).not.toBe(intent.idempotencyKey);
  });
});

describe("command-id — retry preservation policy (Task 3.9)", () => {
  it.each([
    ["network TypeError (connection drop)", new TypeError("fetch failed"), true],
    ["timeout ApiError", new ApiError(408, "network.timeout", "timeout"), true],
    ["500", new ApiError(500, "server.error", "boom"), true],
    ["502", new ApiError(502, "server.error", "boom"), true],
    ["503", new ApiError(503, "server.error", "boom"), true],
    ["unknown non-ApiError", new Error("weird"), true],
    ["400 definitive rejection", new ApiError(400, "validation.error", "bad"), false],
    ["401", new ApiError(401, "auth.error", "no"), false],
    ["403", new ApiError(403, "auth.forbidden", "no"), false],
    ["404", new ApiError(404, "not_found", "no"), false],
    ["409 conflict (replay signal, never blind-retry)", new ApiError(409, "conflict", "dup"), false],
    ["422", new ApiError(422, "validation.error", "bad"), false],
    ["caller abort", new DOMException("aborted", "AbortError"), false],
  ])("%s → retryable=%s", (_label, err, expected) => {
    expect(isRetryableMutationError(err)).toBe(expected);
  });

  it("isIdempotencyConflict is true only for 409", () => {
    expect(isIdempotencyConflict(new ApiError(409, "conflict", "dup"))).toBe(true);
    expect(isIdempotencyConflict(new ApiError(500, "server.error", "x"))).toBe(false);
    expect(isIdempotencyConflict(new TypeError("fetch failed"))).toBe(false);
  });

  it("defaults to a bounded attempt budget", () => {
    expect(MAX_COMMAND_ATTEMPTS).toBeGreaterThanOrEqual(2);
  });

  it("reuses the SAME id across a retry after a retryable failure", async () => {
    const seen: string[] = [];
    const attempt = vi.fn(async (commandId: string) => {
      seen.push(commandId);
      if (seen.length === 1) throw new ApiError(503, "server.error", "flaky");
      return "receipt-ok";
    });
    const out = await retryMutationWithSameCommandId(attempt);
    expect(out.result).toBe("receipt-ok");
    expect(out.attempts).toBe(2);
    expect(seen).toHaveLength(2);
    expect(seen[0]).toBe(seen[1]);
    expect(out.commandId).toBe(seen[0]);
  });

  it("does NOT retry definitive 4xx rejections", async () => {
    const attempt = vi.fn(async (): Promise<string> => {
      throw new ApiError(422, "validation.error", "bad input");
    });
    await expect(retryMutationWithSameCommandId(attempt)).rejects.toMatchObject({ status: 422 });
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it("does NOT retry 409 conflicts (server already holds the original receipt)", async () => {
    const attempt = vi.fn(async (): Promise<string> => {
      throw new ApiError(409, "idempotency.conflict", "replayed");
    });
    await expect(retryMutationWithSameCommandId(attempt)).rejects.toMatchObject({ status: 409 });
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it("gives up after the attempt budget, reusing the same id on every attempt", async () => {
    const seen: string[] = [];
    const attempt = vi.fn(async (commandId: string): Promise<string> => {
      seen.push(commandId);
      throw new TypeError("fetch failed");
    });
    await expect(
      retryMutationWithSameCommandId(attempt, { maxAttempts: 3 }),
    ).rejects.toBeInstanceOf(TypeError);
    expect(attempt).toHaveBeenCalledTimes(3);
    expect(new Set(seen).size).toBe(1);
  });

  it("honours a caller-provided command id", async () => {
    const attempt = vi.fn(async (commandId: string) => `done:${commandId}`);
    const out = await retryMutationWithSameCommandId(attempt, { commandId: "intent-key-9" });
    expect(out.commandId).toBe("intent-key-9");
    expect(out.result).toBe("done:intent-key-9");
    expect(attempt).toHaveBeenCalledWith("intent-key-9");
  });
});
