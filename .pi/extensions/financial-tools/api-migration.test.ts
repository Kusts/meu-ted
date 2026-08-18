import { strict as assert } from "node:assert";
import { readdir, readFile } from "node:fs/promises";
import { afterEach, beforeEach, describe, it } from "node:test";
import { auditLogsTool } from "./tools/audit_logs.js";
import { listAccountsTool } from "./tools/list_accounts.js";
import { listCategoriesTool } from "./tools/list_categories.js";
import { getBalanceTool } from "./tools/get_balance.js";
import { getMonthSummaryTool } from "./tools/get_month_summary.js";
import { listRecentTransactionsTool } from "./tools/list_recent_transactions.js";
import { createExpenseTool } from "./tools/create_expense.js";
import { getCapabilityMode, migratedApiCapabilities } from "./tools/capability-flags.js";
import { spendingInsights } from "./tools/spending_insights.js";
import { setShadowRuntimeForTest } from "./shadow/shadow-runner.js";
import registerFinancialTools from "./index.js";

type Env = Record<string, string | undefined>;
const envKeys = [
  "PI_CAPABILITY_AUDIT_LOGS",
  "PI_CAPABILITY_LIST_ACCOUNTS",
  "PI_CAPABILITY_LIST_CATEGORIES",
  "PI_CAPABILITY_GET_BALANCE",
  "PI_CAPABILITY_GET_MONTH_SUMMARY",
  "PI_CAPABILITY_LIST_RECENT_TRANSACTIONS",
  "PI_CAPABILITY_CREATE_EXPENSE",
  "PI_CAPABILITY_SPENDING_INSIGHTS",
  "PI_FINANCE_API_BASE_URL",
  "PI_FINANCE_API_DEVICE_TOKEN",
  "PI_CONTEXT_TOKEN",
  "PI_SHADOW_READS",
  "PI_SHADOW_DATABASE_URL",
  "PI_SHADOW_LOG_PATH",
  "DATABASE_URL",
] as const;
const originalEnv: Env = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
const originalFetch = globalThis.fetch;

afterEach(() => {
  for (const key of envKeys) {
    const value = originalEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  globalThis.fetch = originalFetch;
  setShadowRuntimeForTest(undefined);
});

describe("API migration flags", () => {
  beforeEach(() => {
    process.env.PI_SHADOW_READS = "off";
    delete process.env.PI_SHADOW_DATABASE_URL;
    delete process.env.PI_SHADOW_LOG_PATH;
  });

  it("enables the API mode for audit_logs and supports disabling it", () => {
    process.env.PI_CAPABILITY_AUDIT_LOGS = "api";
    assert.equal(getCapabilityMode("audit_logs"), "api");

    process.env.PI_CAPABILITY_AUDIT_LOGS = "off";
    assert.equal(getCapabilityMode("audit_logs"), "disabled");
  });

  it("defaults a migrated capability to API mode", () => {
    delete process.env.PI_CAPABILITY_AUDIT_LOGS;
    assert.equal(getCapabilityMode("audit_logs"), "api");
  });

  it("calls GET /audit-logs through the API and never needs DATABASE_URL", async () => {
    process.env.PI_CAPABILITY_AUDIT_LOGS = "api";
    process.env.PI_FINANCE_API_BASE_URL = "http://api.test/";
    process.env.PI_FINANCE_API_DEVICE_TOKEN = "device-token";
    process.env.PI_CONTEXT_TOKEN = "context-token-a";
    delete process.env.DATABASE_URL;

    let request: { url: string; headers: HeadersInit } | undefined;
    globalThis.fetch = async (input, init) => {
      request = { url: String(input), headers: init?.headers ?? {} };
      return new Response(JSON.stringify({
        total: 1,
        items: [{
          id: "log-1",
          workspaceId: "11111111-1111-4111-8111-111111111111",
          actorType: "device",
          actorId: "device-1",
          operation: "accounts.create",
          eventType: "financial_effect.committed",
          payloadHash: "hash",
          effectRef: "22222222-2222-4222-8222-222222222222",
          metadata: { entityType: "account", after: { name: "Conta" } },
          createdAt: "2026-07-31T12:00:00.000Z",
        }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    };

    const result = await auditLogsTool.execute(
      "call-1",
      {
        householdId: "11111111-1111-4111-8111-111111111111",
        limit: 1,
        entityType: "account",
        entityId: "22222222-2222-4222-8222-222222222222",
      },
      new AbortController().signal,
      undefined,
    ) as { success: boolean; logs: Array<Record<string, unknown>> };

    assert.equal(result.success, true);
    assert.equal(result.logs[0]?.action, "accounts.create");
    assert.equal(request?.url, "http://api.test/audit-logs?limit=1&entityType=account&entityId=22222222-2222-4222-8222-222222222222");
    assert.equal(new Headers(request?.headers).get("x-device-token"), "device-token");
    assert.equal(new Headers(request?.headers).get("x-pi-context-token"), "context-token-a");
  });

  it("does not execute a disabled capability", async () => {
    process.env.PI_CAPABILITY_AUDIT_LOGS = "off";
    globalThis.fetch = async () => { throw new Error("fetch must not run"); };

    const result = await auditLogsTool.execute(
      "call-1",
      { householdId: "11111111-1111-4111-8111-111111111111" },
      new AbortController().signal,
      undefined,
    ) as { success: boolean; reason: string };

    assert.equal(result.success, false);
    assert.match(result.reason, /audit_logs.*disabled/i);
  });

  it("toggles every migrated capability and rejects unknown defaults", () => {
    for (const capability of migratedApiCapabilities) {
      assert.equal(getCapabilityMode(capability, {}), "api", capability);
      const flag = `PI_CAPABILITY_${capability.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}`;
      assert.equal(getCapabilityMode(capability, { [flag]: "off" }), "disabled", capability);
    }
    assert.equal(getCapabilityMode("not_migrated", {}), "disabled");
  });

  it("requires an API adapter and flag guard for every migrated capability", async () => {
    const entries = await readdir(new URL("./tools/", import.meta.url), { withFileTypes: true });
    const sources = await Promise.all(entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
      .map(async (entry) => ({ file: entry.name, source: await readFile(new URL(`./tools/${entry.name}`, import.meta.url), "utf8") })));
    const generatedSource = await readFile(new URL("./generated/http-tools.ts", import.meta.url), "utf8");
    for (const capability of migratedApiCapabilities) {
      const source = sources.find(({ file, source }) => file === `${capability}.ts` || source.includes(`name: "${capability}"`));
      assert.ok(source, `missing registered source for ${capability}`);
      const combined = `${source.source}\n${source.source.includes("generated/http-tools.js") ? generatedSource : ""}`;
      assert.match(combined, /api-client\.js/, capability);
      assert.match(combined, /capabilityDisabled|getCapabilityMode/, capability);
      assert.match(combined, /requestPiApiJson|getPiApiJson/, capability);
    }
  });

  it("migrates list_accounts to GET /accounts", async () => {
    process.env.PI_CAPABILITY_LIST_ACCOUNTS = "api";
    process.env.PI_FINANCE_API_BASE_URL = "http://api.test";
    process.env.PI_FINANCE_API_DEVICE_TOKEN = "device-token";
    globalThis.fetch = async () => new Response(JSON.stringify({ items: [{ id: "account-1", name: "Conta", kind: "bank", balanceCents: 1234, status: "active" }], total: 1 }), { status: 200 });
    const result = await listAccountsTool.execute("id", { householdId: "11111111-1111-4111-8111-111111111111" }, new AbortController().signal, undefined) as { accounts: Array<{ id: string; balance_cents: number }> };
    assert.equal(result.accounts[0]?.id, "account-1");
    assert.equal(result.accounts[0]?.balance_cents, 1234);
  });

  it("migrates create_expense to POST /transactions/expense with an idempotency key", async () => {
    process.env.PI_CAPABILITY_CREATE_EXPENSE = "api";
    process.env.PI_FINANCE_API_BASE_URL = "http://api.test";
    process.env.PI_FINANCE_API_DEVICE_TOKEN = "device-token";
    let method = "";
    let idempotency = "";
    globalThis.fetch = async (_input, init) => {
      method = init?.method ?? "";
      idempotency = new Headers(init?.headers).get("idempotency-key") ?? "";
      return new Response(JSON.stringify({ id: "tx-1" }), { status: 201 });
    };
    const result = await createExpenseTool.execute("call-expense", { description: "Mercado", amountCents: 990, categoryId: "33333333-3333-4333-8333-333333333333", accountId: "22222222-2222-4222-8222-222222222222", date: "2026-07-31", householdId: "11111111-1111-4111-8111-111111111111" }, new AbortController().signal, undefined) as { transactionId: string };
    assert.equal(result.transactionId, "tx-1");
    assert.equal(method, "POST");
    assert.equal(idempotency, "call-expense");
  });

  it("reuses persisted intention ID when a write tool is regenerated", async () => {
    process.env.PI_CAPABILITY_CREATE_EXPENSE = "api";
    process.env.PI_FINANCE_API_BASE_URL = "http://api.test";
    process.env.PI_FINANCE_API_DEVICE_TOKEN = "device-token";
    const keys: string[] = [];
    globalThis.fetch = async (_input, init) => {
      keys.push(new Headers(init?.headers).get("idempotency-key") ?? "");
      return new Response(JSON.stringify({ id: "tx-1" }), { status: 201 });
    };
    const params = {
      intentionId: "intention-1",
      description: "Mercado",
      amountCents: 990,
      categoryId: "33333333-3333-4333-8333-333333333333",
      accountId: "22222222-2222-4222-8222-222222222222",
      date: "2026-07-31",
      householdId: "11111111-1111-4111-8111-111111111111",
    };
    await createExpenseTool.execute("regenerated-call-a", params, new AbortController().signal, undefined);
    await createExpenseTool.execute("regenerated-call-b", params, new AbortController().signal, undefined);
    assert.deepEqual(keys, ["intention-1", "intention-1"]);
  });

  it("injects persisted intention ID from tool context on regenerated writes", async () => {
    process.env.PI_CAPABILITY_CREATE_EXPENSE = "api";
    process.env.PI_FINANCE_API_BASE_URL = "http://api.test";
    process.env.PI_FINANCE_API_DEVICE_TOKEN = "device-token";
    const keys: string[] = [];
    globalThis.fetch = async (_input, init) => {
      keys.push(new Headers(init?.headers).get("idempotency-key") ?? "");
      return new Response(JSON.stringify({ id: "tx-1" }), { status: 201 });
    };
    const registered = new Map<string, { execute: (...args: unknown[]) => Promise<unknown> }>();
    registerFinancialTools({ registerTool: (tool) => registered.set(tool.name, tool) } as never);
    const tool = registered.get("create_expense");
    assert.ok(tool);
    const params = {
      description: "Mercado",
      amountCents: 990,
      categoryId: "33333333-3333-4333-8333-333333333333",
      accountId: "22222222-2222-4222-8222-222222222222",
      date: "2026-07-31",
      householdId: "11111111-1111-4111-1111-111111111111",
    };
    const ctx = {
      sessionManager: {
        getBranch: () => [{
          type: "message",
          message: { role: "user", content: "[PI_INTENTION_ID=intention-1] register expense" },
        }],
      },
    };
    await tool.execute("new-a", params, new AbortController().signal, undefined, ctx);
    await tool.execute("new-b", params, new AbortController().signal, undefined, ctx);
    assert.deepEqual(keys, ["intention-1", "intention-1"]);
  });

  it("migrates spending_insights to GET /insights/spending", async () => {
    process.env.PI_CAPABILITY_SPENDING_INSIGHTS = "api";
    process.env.PI_FINANCE_API_BASE_URL = "http://api.test";
    process.env.PI_FINANCE_API_DEVICE_TOKEN = "device-token";
    let url = "";
    globalThis.fetch = async (input) => {
      url = String(input);
      return new Response(JSON.stringify({ yearMonth: "2026-06", comparisons: [], anomalies: [], incomeShare: [] }), { status: 200 });
    };
    const result = await spendingInsights.execute("call-si", { householdId: "11111111-1111-4111-8111-111111111111", yearMonth: "2026-06", insightType: "all", lookbackMonths: 3 }) as { success: boolean };
    assert.equal(result.success, true);
    assert.equal(url, "http://api.test/insights/spending?yearMonth=2026-06&insightType=all&lookbackMonths=3");
  });

  it("migrates list_categories to GET /categories", async () => {
    process.env.PI_CAPABILITY_LIST_CATEGORIES = "api";
    process.env.PI_FINANCE_API_BASE_URL = "http://api.test";
    process.env.PI_FINANCE_API_DEVICE_TOKEN = "device-token";
    globalThis.fetch = async () => new Response(JSON.stringify({ items: [{ id: "category-1", name: "Alimentação", kind: "expense", status: "active" }], total: 1 }), { status: 200 });
    const result = await listCategoriesTool.execute("id", { householdId: "11111111-1111-4111-8111-111111111111" }, new AbortController().signal, undefined) as { categories: Array<{ id: string }> };
    assert.equal(result.categories[0]?.id, "category-1");
  });

  it("migrates get_balance through the scoped accounts API", async () => {
    process.env.PI_CAPABILITY_GET_BALANCE = "api";
    process.env.PI_FINANCE_API_BASE_URL = "http://api.test";
    process.env.PI_FINANCE_API_DEVICE_TOKEN = "device-token";
    let url = "";
    globalThis.fetch = async (input) => {
      url = String(input);
      return new Response(JSON.stringify({ id: "22222222-2222-4222-8222-222222222222", name: "Conta", kind: "bank", balanceCents: -12, status: "active" }), { status: 200 });
    };
    const result = await getBalanceTool.execute("id", { accountId: "22222222-2222-4222-8222-222222222222", householdId: "11111111-1111-4111-8111-111111111111" }, new AbortController().signal, undefined) as { balanceCents: number };
    assert.equal(result.balanceCents, -12);
    assert.equal(url, "http://api.test/accounts/22222222-2222-4222-8222-222222222222");
  });

  it("migrates list_recent_transactions to GET /transactions", async () => {
    process.env.PI_CAPABILITY_LIST_RECENT_TRANSACTIONS = "api";
    process.env.PI_FINANCE_API_BASE_URL = "http://api.test";
    process.env.PI_FINANCE_API_DEVICE_TOKEN = "device-token";
    globalThis.fetch = async () => new Response(JSON.stringify({ items: [{ id: "tx-1", kind: "expense", description: "Mercado", amountCents: 990, date: "2026-07-31", accountId: "22222222-2222-4222-8222-222222222222" }], total: 1, limit: 10, offset: 0 }), { status: 200 });
    const result = await listRecentTransactionsTool.execute("id", { householdId: "11111111-1111-4111-8111-111111111111" }, new AbortController().signal, undefined) as { transactions: Array<{ id: string; amount_cents: number }> };
    assert.equal(result.transactions[0]?.id, "tx-1");
    assert.equal(result.transactions[0]?.amount_cents, 990);
  });

  it("runs generated read shadow, logs divergence, and preserves the Pi response", async () => {
    process.env.PI_CAPABILITY_LIST_ACCOUNTS = "api";
    process.env.PI_SHADOW_READS = "on";
    process.env.PI_FINANCE_API_BASE_URL = "http://api.test";
    process.env.PI_FINANCE_API_DEVICE_TOKEN = "device-token";
    const events: unknown[] = [];
    setShadowRuntimeForTest({
      enabled: true,
      readers: { list_accounts: async () => ({ accounts: [{ id: "account-1", name: "Conta", balance_cents: 900, active: true }] }) },
      log: (event) => events.push(event),
    });
    globalThis.fetch = async () => new Response(JSON.stringify({ items: [{ id: "account-1", name: "Conta", kind: "bank", balanceCents: 1000, status: "active" }], total: 1 }), { status: 200 });

    const result = await listAccountsTool.execute("shadow-call", { householdId: "11111111-1111-4111-8111-111111111111" }, new AbortController().signal, undefined) as { accounts: Array<{ balance_cents: number }> };
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(result.accounts[0]?.balance_cents, 1000);
    assert.equal((events[0] as { kind: string }).kind, "divergence");
  });

  it("keeps shadow comparison read-only and out of write tools", async () => {
    const generatedSource = await readFile(new URL("./generated/http-tools.ts", import.meta.url), "utf8");
    const legacyShadow = await readFile(new URL("./shadow/legacy-readers.ts", import.meta.url), "utf8");
    assert.doesNotMatch(legacyShadow, /\bINSERT\s+INTO\b|\bUPDATE\s+\w+\s+SET\b|\bDELETE\s+FROM\b/i);
    // Write tools must never have shadow enabled
    const specsMatch = generatedSource.match(/const specs = (\[[\s\S]*?\n\]) as const;/);
    assert.ok(specsMatch, "specs array must be present");
    const specs = JSON.parse(specsMatch[1]) as Array<{ name: string; method: string; shadow: boolean }>;
    const mutatingWithShadow = specs.filter((s) => s.method !== "GET" && s.shadow);
    assert.deepEqual(mutatingWithShadow, [], "No mutating HTTP tools can have shadow: true");
  });


  it("keeps every registered Pi tool facade free of direct SQL", async () => {
    const facadeFiles = [
      "audit_logs.ts", "cancel_pending_operation.ts", "confirm_pending_operation.ts",
      "create_account.ts", "create_category.ts", "create_expense.ts", "create_income.ts",
      "create_transfer.ts", "deactivate_account.ts", "deactivate_category.ts",
      "delete_transaction.ts", "get_balance.ts", "get_month_summary.ts",
      "get_pending_operation.ts", "list_accounts.ts", "list_categories.ts",
      "list_recent_transactions.ts", "spending_insights.ts", "undo_last_action.ts",
      "update_account.ts", "update_category.ts", "update_transaction.ts",
    ];
    for (const file of facadeFiles) {
      const source = await readFile(new URL(`./tools/${file}`, import.meta.url), "utf8");
      assert.doesNotMatch(source, /from ["']pg["']|new pg\.Pool|\.query\(|\bSELECT\s+.+\s+FROM\b|\bINSERT\s+INTO\b|\bUPDATE\s+\w+\s+SET\b|\bDELETE\s+FROM\b/i, file);
    }
  });

  it("freezes write tools with runtime.write_frozen when FINANCE_RUNTIME_STAGE is frozen or agent_owner", async () => {
    const { isWriteFrozen } = await import("./tools/capability-flags.js");
    const { checkToolExecutionPolicy } = await import("./tools/api-tool-helpers.js");

    assert.equal(isWriteFrozen({ FINANCE_RUNTIME_STAGE: "frozen" }), true);
    assert.equal(isWriteFrozen({ FINANCE_RUNTIME_STAGE: "agent_owner" }), true);
    assert.equal(isWriteFrozen({ FINANCE_RUNTIME_STAGE: "agent_owner_pi_read_fallback" }), true);
    assert.equal(isWriteFrozen({ FINANCE_RUNTIME_STAGE: "pi_owner" }), false);

    // Read tool allowed in frozen stage
    const readCheck = checkToolExecutionPolicy("list_accounts", "read", { FINANCE_RUNTIME_STAGE: "frozen" });
    assert.equal(readCheck, null);

    // Write tool blocked with runtime.write_frozen
    const writeCheck = checkToolExecutionPolicy("create_expense", "write", { FINANCE_RUNTIME_STAGE: "frozen" });
    assert.deepEqual(writeCheck, { success: false, reason: "runtime.write_frozen" });
  });
});



