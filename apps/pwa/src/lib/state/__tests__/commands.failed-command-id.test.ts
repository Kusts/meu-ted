// Finding 2 [major] — the command id must survive exhausted retries.
// After automatic retries fail with an unknown outcome, the surfaced error
// carries the intent's command id; a manual retry reusing it sends ONE id
// end-to-end (no duplicate financial effect on a committed-but-lost response).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createCommands, type CommandsContext } from "../commands";
import { getFailedCommandId } from "@/lib/api/command-id";
import * as endpoints from "@/lib/api/endpoints";

function makeContext(dispatch = vi.fn()): CommandsContext {
  return { online: true, token: "tok", dispatch, api: endpoints };
}

function txInput() {
  return {
    description: "Mercado",
    amountCents: 15000,
    date: "2026-09-01",
    categoryId: "cat-1",
    accountId: "acc-1",
  };
}

function keyOf(spy: { mock: { calls: unknown[][] } }, call = 0): unknown {
  const args = spy.mock.calls[call] as [{ idempotencyKey?: unknown }] | undefined;
  return args?.[0]?.idempotencyKey;
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("commands — failed command id is surfaced for manual retry (Finding 2)", () => {
  it("two consecutive network failures then a manual retry reuse ONE id", async () => {
    const apiSpy = vi.spyOn(endpoints, "createExpenseTransaction")
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce({ id: "tx-1" } as never);
    const commands = createCommands(makeContext());

    const failed = await commands.createExpenseTransaction(txInput()).catch((e) => e);
    expect(failed).toBeInstanceOf(Error);
    const failedId = getFailedCommandId(failed);
    expect(typeof failedId).toBe("string");
    // Both automatic attempts already used that same id.
    expect(apiSpy).toHaveBeenCalledTimes(2);
    expect(keyOf(apiSpy, 0)).toBe(failedId);
    expect(keyOf(apiSpy, 1)).toBe(failedId);

    // Manual retry reusing the error's command id: one id end-to-end.
    await commands.createExpenseTransaction({ ...txInput(), idempotencyKey: failedId });
    expect(apiSpy).toHaveBeenCalledTimes(3);
    expect(keyOf(apiSpy, 2)).toBe(failedId);
  });

  it("id-only commands surface the threaded command id on failure", async () => {
    const apiSpy = vi.spyOn(endpoints, "markPayablePaid")
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockRejectedValueOnce(new TypeError("fetch failed"));
    const commands = createCommands(makeContext());

    const failed = await commands.markPayablePaid("pay-1", "2026-09-01").catch((e) => e);
    const failedId = getFailedCommandId(failed);
    expect(typeof failedId).toBe("string");
    expect(apiSpy.mock.calls[0]?.[2]).toBe(failedId);
    expect(apiSpy.mock.calls[1]?.[2]).toBe(failedId);
  });
});
