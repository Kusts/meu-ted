import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { compareShadowRead } from "./shadow-read.js";
import { getShadowReadMode } from "./shadow-config.js";

describe("shadow read configuration", () => {
  it("defaults shadow reads off and accepts on aliases", () => {
    assert.equal(getShadowReadMode({}), "off");
    assert.equal(getShadowReadMode({ PI_SHADOW_READS: "on" }), "on");
    assert.equal(getShadowReadMode({ PI_SHADOW_READS: "1" }), "on");
    assert.equal(getShadowReadMode({ PI_SHADOW_READS: "off" }), "off");
  });
});

describe("shadow read comparison", () => {
  it("does not call legacy reader when shadow is disabled", async () => {
    let calls = 0;
    const events: unknown[] = [];

    const result = await compareShadowRead({
      enabled: false,
      capability: "list_accounts",
      request: { householdId: "household-a" },
      apiValue: { items: [] },
      legacyRead: async () => {
        calls += 1;
        return { items: [] };
      },
      log: (event) => events.push(event),
    });

    assert.equal(result, null);
    assert.equal(calls, 0);
    assert.deepEqual(events, []);
  });

  it("does not log equal read projections", async () => {
    const events: unknown[] = [];

    const result = await compareShadowRead({
      enabled: true,
      capability: "list_accounts",
      request: { householdId: "household-a" },
      apiValue: { success: true, total: 1, items: [{ id: "a", balanceCents: 100 }], accounts: [{ id: "a", balance_cents: 100, active: true }] },
      legacyRead: async () => ({ accounts: [{ id: "a", balance_cents: 100, active: true }] }),
      log: (event) => events.push(event),
    });

    assert.equal(result, null);
    assert.deepEqual(events, []);
  });

  it("normalizes account metadata before comparing get_balance", async () => {
    const events: unknown[] = [];
    const result = await compareShadowRead({
      enabled: true,
      capability: "get_balance",
      request: { householdId: "household-a", accountId: "account-a" },
      apiValue: { success: true, id: "account-a", householdId: "household-a", name: "Conta", kind: "bank", balanceCents: 75, status: "active" },
      legacyRead: async () => ({ id: "account-a", balanceCents: 75 }),
      log: (event) => events.push(event),
    });
    assert.equal(result, null);
    assert.deepEqual(events, []);
  });

  it("normalizes audit log aliases before comparing", async () => {
    const events: unknown[] = [];
    const log = { id: "log-a", action: "accounts.create", event_type: "legacy.accounts.create", actor_id: "legacy-unknown", created_at: "2026-07-31T00:00:00.000Z" };
    const result = await compareShadowRead({
      enabled: true,
      capability: "audit_logs",
      request: { householdId: "household-a" },
      apiValue: { success: true, total: 1, items: [], logs: [log] },
      legacyRead: async () => ({ logs: [log] }),
      log: (event) => events.push(event),
    });
    assert.equal(result, null);
    assert.deepEqual(events, []);
  });

  it("logs a bounded divergence event with stable hashes", async () => {
    const events: Array<Record<string, unknown>> = [];

    const result = await compareShadowRead({
      enabled: true,
      capability: "list_accounts",
      request: { householdId: "household-a" },
      apiValue: { success: true, total: 1, items: [{ id: "a", balanceCents: 100 }], accounts: [{ id: "a", balance_cents: 100, active: true }] },
      legacyRead: async () => ({ accounts: [{ id: "a", balance_cents: 90, active: true }] }),
      log: (event) => events.push(event),
    });

    assert.equal(result?.kind, "divergence");
    assert.equal(events.length, 1);
    assert.equal(events[0]?.capability, "list_accounts");
    assert.match(String(events[0]?.requestHash), /^[a-f0-9]{64}$/);
    assert.match(String(events[0]?.apiHash), /^[a-f0-9]{64}$/);
    assert.match(String(events[0]?.legacyHash), /^[a-f0-9]{64}$/);
    assert.equal(JSON.stringify(events[0]).includes("household-a"), false);
  });

  it("redacts credentials from legacy read failures", async () => {
    const events: Array<Record<string, unknown>> = [];

    await compareShadowRead({
      enabled: true,
      capability: "audit_logs",
      request: {},
      apiValue: {},
      legacyRead: async () => {
        throw new Error("password=secret token=abc");
      },
      log: (event) => events.push(event),
    });

    assert.equal(events[0]?.error, "password=[REDACTED] token=[REDACTED]");
  });

  it("logs legacy read failures without rejecting the API path", async () => {
    const events: Array<Record<string, unknown>> = [];

    const result = await compareShadowRead({
      enabled: true,
      capability: "audit_logs",
      request: { householdId: "household-a" },
      apiValue: { items: [] },
      legacyRead: async () => {
        throw new Error("database unavailable");
      },
      log: (event) => events.push(event),
    });

    assert.equal(result?.kind, "legacy_error");
    assert.equal(events[0]?.error, "database unavailable");
  });
});
