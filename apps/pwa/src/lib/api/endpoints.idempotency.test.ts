// P0 idempotency regressions: every financial mutation must carry a valid
// Idempotency-Key header at the authoritative HTTP boundary, and a
// caller-provided key must be propagated verbatim (never leaked into the body).
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as endpoints from "./endpoints";
import { apiFetch } from "./client";

vi.mock("./client", () => ({ apiFetch: vi.fn() }));
const mocked = vi.mocked(apiFetch);

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function optionsOf(i = 0): Record<string, unknown> {
  return (mocked.mock.calls[i]?.[1] as Record<string, unknown> | undefined) ?? {};
}

function headerKeyOf(i = 0): string | undefined {
  return optionsOf(i).idempotencyKey as string | undefined;
}

function bodyOf(i = 0): Record<string, unknown> {
  const raw = optionsOf(i).body as string | undefined;
  return raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
}

beforeEach(() => {
  mocked.mockReset();
  mocked.mockImplementation(async () => ({}) as never);
});

describe("endpoints — idempotency-key propagation on mutations", () => {
  it("generates a valid UUID key when the caller does not provide one", async () => {
    await endpoints.createExpenseTransaction({
      description: "x",
      amountCents: 1,
      categoryId: "c",
      accountId: "a",
      date: "2026-01-01",
    });
    expect(headerKeyOf()).toMatch(UUID_V4);
  });

  it("keeps the generated key out of the JSON body", async () => {
    await endpoints.createExpenseTransaction({
      description: "x",
      amountCents: 1,
      categoryId: "c",
      accountId: "a",
      date: "2026-01-01",
    });
    expect(bodyOf().idempotencyKey).toBeUndefined();
    expect(bodyOf().description).toBe("x");
  });

  it("propagates a caller-provided key to the header instead of the body", async () => {
    await endpoints.createExpenseTransaction({
      description: "x",
      amountCents: 1,
      categoryId: "c",
      accountId: "a",
      date: "2026-01-01",
      idempotencyKey: "caller-key-123",
    } as Parameters<typeof endpoints.createExpenseTransaction>[0]);
    expect(headerKeyOf()).toBe("caller-key-123");
    expect(bodyOf().idempotencyKey).toBeUndefined();
  });

  it("covers bodyless POST mutations (cancelSubscription)", async () => {
    await endpoints.cancelSubscription("s1");
    expect(headerKeyOf()).toMatch(UUID_V4);
    expect(optionsOf().body).toBeUndefined();
  });

  it("covers PATCH mutations (updateTransaction)", async () => {
    await endpoints.updateTransaction("t1", { description: "d" });
    expect(headerKeyOf()).toMatch(UUID_V4);
  });

  it("covers DELETE mutations (deleteTransaction)", async () => {
    await endpoints.deleteTransaction("t1");
    expect(headerKeyOf()).toMatch(UUID_V4);
  });

  it("covers pending operation approvals", async () => {
    await endpoints.approvePendingOperation("op-1");
    expect(headerKeyOf()).toMatch(UUID_V4);
  });

  it("does not stamp idempotency keys on reads", async () => {
    await endpoints.fetchAccounts();
    expect(headerKeyOf()).toBeUndefined();
  });
});
