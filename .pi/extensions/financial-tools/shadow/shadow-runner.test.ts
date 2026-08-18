import { strict as assert } from "node:assert";
import { afterEach, describe, it } from "node:test";
import { createShadowRunner } from "./shadow-runner.js";
import { getUnsupportedShadowFilters } from "./shadow-filters.js";
import { createLegacyReaders } from "./legacy-readers.js";

const originalShadowFlag = process.env.PI_SHADOW_READS;
const request = { householdId: "household-a" };

afterEach(() => {
  if (originalShadowFlag === undefined) delete process.env.PI_SHADOW_READS;
  else process.env.PI_SHADOW_READS = originalShadowFlag;
});

describe("shadow runner", () => {
  it("compares an eligible read and keeps the API value untouched", async () => {
    const events: unknown[] = [];
    const readers = createLegacyReaders(async () => []);
    const runner = createShadowRunner({ enabled: true, readers, log: (event) => events.push(event) });

    const apiValue = { accounts: [] };
    const result = await runner("list_accounts", request, apiValue);

    assert.deepEqual(result, apiValue);
    assert.deepEqual(events, []);
  });

  it("fails open when shadow configuration is invalid", async () => {
    process.env.PI_SHADOW_READS = "invalid";
    const result = await import("./shadow-runner.js").then(({ runShadowRead }) => runShadowRead("list_accounts", request, { accounts: [] }));
    assert.deepEqual(result, { accounts: [] });
  });

  it("explicitly skips filters without a legacy equivalent", async () => {
    let calls = 0;
    const runner = createShadowRunner({
      enabled: true,
      readers: { list_accounts: async () => { calls += 1; return {}; } },
      log: () => undefined,
    });

    assert.deepEqual(getUnsupportedShadowFilters("list_accounts", { householdId: "h", kind: "bank" }), ["kind"]);
    const result = await runner("list_accounts", { householdId: "h", kind: "bank" }, { accounts: [] });
    assert.deepEqual(result, { accounts: [] });
    assert.equal(calls, 0);

    const auditRunner = createShadowRunner({
      enabled: true,
      readers: { audit_logs: async () => { calls += 1; return { logs: [] }; } },
      log: () => undefined,
    });
    assert.deepEqual(getUnsupportedShadowFilters("audit_logs", { householdId: "h", limit: 1 }), []);
    await auditRunner("audit_logs", { householdId: "h", limit: 1 }, { logs: [] });
    assert.equal(calls, 1);
  });

  it("does not invoke legacy readers for an unsupported capability", async () => {
    let calls = 0;
    const runner = createShadowRunner({
      enabled: true,
      readers: { list_accounts: async () => { calls += 1; return {}; } },
      log: () => undefined,
    });

    const result = await runner("spending_insights", request, { comparisons: [] });

    assert.deepEqual(result, { comparisons: [] });
    assert.equal(calls, 0);
  });

  it("never executes write capabilities or mutating HTTP methods in shadow", async () => {
    let mutatingCalls = 0;
    const mutatingSpy = {
      create_expense: async () => { mutatingCalls += 1; return { success: true }; },
      pay_statement: async () => { mutatingCalls += 1; return { success: true }; },
      delete_transaction: async () => { mutatingCalls += 1; return { success: true }; },
    };

    const runner = createShadowRunner({
      enabled: true,
      readers: mutatingSpy as never,
      log: () => undefined,
    });

    const writeCapabilities = ["create_expense", "pay_statement", "delete_transaction", "confirm_pending_operation"];
    for (const capability of writeCapabilities) {
      const apiValue = { success: true, id: "test-id" };
      const result = await runner(capability, request, apiValue);
      assert.deepEqual(result, apiValue);
    }
    assert.equal(mutatingCalls, 0, "Shadow MUST never invoke write operations");
  });

  it("guarantees Pi response is byte-equivalent whether shadow is on or off", async () => {
    const apiValue = {
      success: true,
      total: 2,
      items: [
        { id: "acc-1", name: "Corrente", balanceCents: 50000 },
        { id: "acc-2", name: "Poupança", balanceCents: 150000 },
      ],
    };

    const readers = createLegacyReaders(async () => [
      { id: "acc-1", name: "Corrente", balance_cents: 50000, active: true },
      { id: "acc-2", name: "Poupança", balance_cents: 150000, active: true },
    ]);

    const runnerOn = createShadowRunner({ enabled: true, readers, log: () => undefined });
    const runnerOff = createShadowRunner({ enabled: false, readers, log: () => undefined });

    const resultOn = await runnerOn("list_accounts", request, apiValue);
    const resultOff = await runnerOff("list_accounts", request, apiValue);

    assert.equal(JSON.stringify(resultOn), JSON.stringify(resultOff));
    assert.deepEqual(resultOn, apiValue);
  });

  it("sanitizes all secret tokens and raw descriptions in divergence logs", async () => {
    const loggedEvents: Array<Record<string, unknown>> = [];
    const runner = createShadowRunner({
      enabled: true,
      readers: {
        list_accounts: async () => {
          throw new Error("Failed connecting with token=eyJhbGciOiJIUzI1Ni device_token=secret-dev-token and phone 5511999998888");
        },
      },
      log: (event) => loggedEvents.push(event as unknown as Record<string, unknown>),
    });

    const sensitiveRequest = {
      householdId: "household-123",
    };

    const apiValue = { accounts: [{ id: "acc-1", description: "Salário Secreto R$ 50.000" }] };
    await runner("list_accounts", sensitiveRequest, apiValue);

    assert.equal(loggedEvents.length, 1);
    const serialized = JSON.stringify(loggedEvents[0]);
    assert.equal(serialized.includes("secret-dev-token"), false, "Must not contain raw device token");
    assert.equal(serialized.includes("secret-token-value"), false, "Must not contain raw request tokens");
    assert.equal(serialized.includes("5511999998888"), false, "Must not contain raw phone number");
    assert.equal(serialized.includes("Salário Secreto"), false, "Must not contain raw description text");
    assert.match(String(loggedEvents[0]?.requestHash), /^[a-f0-9]{64}$/, "Must use stable hash");
  });

  it("handles adversarial scenarios gracefully without altering owner output", async () => {
    // 1. Reader throwing arbitrary error
    const throwingRunner = createShadowRunner({
      enabled: true,
      readers: {
        list_accounts: async () => { throw new Error("Postgres connection timeout 5000ms"); },
      },
      log: () => undefined,
    });
    const apiValue = { accounts: [{ id: "1" }] };
    const r1 = await throwingRunner("list_accounts", request, apiValue);
    assert.deepEqual(r1, apiValue);

    // 2. Slow reader does not block response resolution
    const slowRunner = createShadowRunner({
      enabled: true,
      readers: {
        list_accounts: async () => new Promise((resolve) => setTimeout(() => resolve({}), 10)),
      },
      log: () => undefined,
    });
    const r2 = await slowRunner("list_accounts", request, apiValue);
    assert.deepEqual(r2, apiValue);

    // 3. Null / undefined / empty values
    const r3 = await throwingRunner("list_accounts", request, null as never);
    assert.equal(r3, null);
  });
});

