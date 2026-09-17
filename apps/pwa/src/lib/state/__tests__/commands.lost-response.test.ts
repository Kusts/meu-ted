// V4.1 Task 3.10 (SPEC §10.5): lost-response scenario end-to-end through the
// real client stack (commands → endpoints → apiFetch → fetch).
//
// Server double models an idempotent API: effects are keyed by the incoming
// Idempotency-Key header. A replayed key returns the ORIGINAL receipt without
// a new financial effect; an unknown key commits a new effect.
import { describe, it, expect, vi, afterEach } from "vitest";
import { createCommands } from "../commands";
import * as endpoints from "@/lib/api/endpoints";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function stubApiBase() {
  vi.stubEnv("NEXT_PUBLIC_PI_FINANCE_API_BASE_URL", "https://api.example.com");
}

function headerKey(call: unknown[]): string | undefined {
  const init = call[1] as { headers?: Record<string, string> } | undefined;
  return init?.headers?.["idempotency-key"];
}

/** Idempotent server double. Returns { fetchMock, effects }. */
function installIdempotentServerDouble(opts: { dropFirstResponse: boolean }) {
  stubApiBase();
  const receipts = new Map<string, Record<string, unknown>>();
  let effects = 0;
  let calls = 0;
  const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
    calls += 1;
    const headers = (init as { headers?: Record<string, string> } | undefined)?.headers ?? {};
    const key = headers["idempotency-key"] ?? "";
    expect(key).toMatch(UUID_V4);
    const replay = receipts.get(key);
    if (replay) {
      return new Response(JSON.stringify(replay), { status: 200 });
    }
    // First-seen key: commit exactly one financial effect.
    effects += 1;
    const isPay = String(url).includes("/payables/");
    const receipt: Record<string, unknown> = isPay
      ? { id: "pay-1", status: "paid" }
      : { id: "tx-server-1", description: "Mercado", amountCents: 15000 };
    receipts.set(key, receipt);
    if (opts.dropFirstResponse && calls === 1) {
      // Server COMMITTED, but the response never reached the client.
      throw new TypeError("fetch failed");
    }
    return new Response(JSON.stringify(receipt), { status: 200 });
  });
  return { fetchMock, effects: () => effects, receipts };
}

function onlineCommands() {
  return createCommands({ online: true, token: "tok", dispatch: vi.fn(), api: endpoints });
}

describe("lost-response — server commit + dropped response, client retries (Task 3.10)", () => {
  it("same Idempotency-Key on both attempts, single server effect, single receipt", async () => {
    const server = installIdempotentServerDouble({ dropFirstResponse: true });
    const commands = onlineCommands();

    const result = await commands.createExpenseTransaction({
      description: "Mercado",
      amountCents: 15000,
      date: "2026-09-01",
      categoryId: "cat-1",
      accountId: "acc-1",
    });

    expect(server.fetchMock).toHaveBeenCalledTimes(2);
    const firstKey = headerKey(server.fetchMock.mock.calls[0]!);
    const secondKey = headerKey(server.fetchMock.mock.calls[1]!);
    expect(firstKey).toBeDefined();
    expect(secondKey).toBe(firstKey);
    // Single financial effect despite two HTTP attempts…
    expect(server.effects()).toBe(1);
    // …and the client converges to that single receipt.
    expect(result).toEqual({ id: "tx-server-1", description: "Mercado", amountCents: 15000 });
  });

  it("id-only mutation (markPayablePaid) reuses the key after a 503: one payment effect", async () => {
    stubApiBase();
    const receipts = new Map<string, Record<string, unknown>>();
    let effects = 0;
    let calls = 0;
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
      calls += 1;
      if (calls === 1) {
        return new Response(JSON.stringify({ code: "server.error", message: "flaky" }), { status: 503 });
      }
      const headers = (init as { headers?: Record<string, string> } | undefined)?.headers ?? {};
      const key = headers["idempotency-key"] ?? "";
      const replay = receipts.get(key);
      if (replay) return new Response(JSON.stringify(replay), { status: 200 });
      effects += 1;
      const receipt = { id: "pay-1", status: "paid" };
      receipts.set(key, receipt);
      return new Response(JSON.stringify(receipt), { status: 200 });
    });
    const commands = onlineCommands();

    const result = await commands.markPayablePaid("pay-1", "2026-09-01");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(headerKey(fetchMock.mock.calls[1]!)).toBe(headerKey(fetchMock.mock.calls[0]!));
    expect(effects).toBe(1);
    expect(result).toEqual({ id: "pay-1", status: "paid" });
  });
});
