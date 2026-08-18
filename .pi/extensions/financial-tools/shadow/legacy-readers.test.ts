import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { createLegacyReaders, type LegacyQuery } from "./legacy-readers.js";

const queryFor = (responses: unknown[][]): LegacyQuery => {
  let index = 0;
  return async () => responses[index++] ?? [];
};

describe("legacy shadow readers", () => {
  it("projects accounts with calculated balances", async () => {
    const readers = createLegacyReaders(queryFor([
      [{ id: "a", name: "Conta", initial_balance_cents: "100", active: true }],
      [{ from_account_id: "a", to_account_id: null, kind: "expense", amount_cents: "25" }],
    ]));

    assert.deepEqual(await readers.list_accounts({ householdId: "h" }), {
      accounts: [{ id: "a", name: "Conta", balance_cents: 75, active: true }],
    });
  });

  it("projects month summary with the old aggregation semantics", async () => {
    const readers = createLegacyReaders(queryFor([
      [{ kind: "income", total: "500" }, { kind: "expense", total: "125" }],
    ]));

    assert.deepEqual(await readers.get_month_summary({ householdId: "h", yearMonth: "2026-07" }), {
      incomeCents: 500,
      expenseCents: 125,
      balanceCents: 375,
      yearMonth: "2026-07",
    });
  });

  it("projects balance and category status using legacy fields", async () => {
    const readers = createLegacyReaders(queryFor([
      [{ id: "a", name: "Conta", initial_balance_cents: "100" }],
      [{ from_account_id: "a", to_account_id: null, kind: "expense", amount_cents: "25" }],
      [{ id: "c", name: "Mercado", kind: "expense", active: true }],
    ]));

    assert.deepEqual(await readers.get_balance({ householdId: "h", accountId: "a" }), { id: "a", balanceCents: 75 });
    assert.deepEqual(await readers.list_categories({ householdId: "h" }), {
      categories: [{ id: "c", name: "Mercado", kind: "expense", status: "active" }],
    });
  });

  it("projects audit logs with snapshot fields", async () => {
    const readers = createLegacyReaders(queryFor([
      [{ id: "l", entity_type: "account", entity_id: "a", action: "create", before_json: null, after_json: {}, created_at: "2026-07-31T00:00:00.000Z" }],
    ]));

    assert.deepEqual(await readers.audit_logs({ householdId: "h", entityType: "account", entityId: "a" }), {
      logs: [{ id: "l", action: "create", event_type: "legacy.create", actor_id: "legacy-unknown", created_at: "2026-07-31T00:00:00.000Z" }],
    });
  });

  it("projects recent transactions without executing writes", async () => {
    const statements: string[] = [];
    const query: LegacyQuery = async (sql) => {
      statements.push(sql);
      return [{ id: "t", kind: "expense", amount_cents: "10", description: "Cafe", date: "2026-07-31", status: "active" }];
    };
    const readers = createLegacyReaders(query);

    const result = await readers.list_recent_transactions({ householdId: "h", limit: 1 }) as { transactions: Array<{ amount_cents: number }> };

    assert.equal(result.transactions[0]?.amount_cents, 10);
    assert.equal(statements.every((sql) => /^\s*SELECT\b/i.test(sql)), true);
  });

  it("passes transaction filters to legacy SQL", async () => {
    const params: readonly unknown[][] = [];
    const readers = createLegacyReaders(async (_sql, values) => {
      params.push(values);
      return [];
    });

    await readers.list_recent_transactions({ householdId: "h", startDate: "2026-07-01", endDate: "2026-07-31", categoryId: "c", kind: "expense", minAmountCents: 10, maxAmountCents: 20, query: "cafe", limit: 2, offset: 3 });
    assert.deepEqual(params, [["h", "2026-07-01", "2026-07-31", "c", "expense", 10, 20, "%cafe%", 2, 3]]);
  });

  it("passes account and audit filters to legacy SQL", async () => {
    const params: readonly unknown[][] = [];
    const readers = createLegacyReaders(async (_sql, values) => {
      params.push(values);
      return [];
    });

    await readers.list_recent_transactions({ householdId: "h", accountId: "a", limit: 2 });
    await readers.audit_logs({ householdId: "h", entityType: "account", entityId: "a", limit: 2 });

    assert.deepEqual(params, [["h", "a", 2, 0], ["h", "account", "a", 2]]);
  });
});
