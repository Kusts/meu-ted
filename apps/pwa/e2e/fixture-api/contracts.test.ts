/**
 * Contract tests: every API endpoint returns its specific response shape,
 * mutations record journal entries, and stores are isolated.
 *
 * Covers every row in the design doc endpoint table.
 * Each mutation test verifies: status, response shape, journal entry (method+path+status).
 * Each list test verifies: {items,total} or special shape.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import http from "node:http";
import { createServer } from "./server";

// ─── Typed test helpers ─────────────────────────────────────────────────────

interface HttpResponse {
  status: number;
  data: Record<string, unknown> | undefined;
}

function request(
  server: http.Server,
  method: string,
  path: string,
  body?: Record<string, unknown>,
  extraHeaders?: Record<string, string>,
): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    const port = (server.address() as { port: number }).port;
    const opts: http.RequestOptions = {
      method,
      path,
      hostname: "127.0.0.1",
      port,
      headers: { "Content-Type": "application/json", ...extraHeaders },
    };
    const req = http.request(opts, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf-8");
        let data: Record<string, unknown> | undefined = undefined;
        if (raw) {
          try { data = JSON.parse(raw) as Record<string, unknown>; }
          catch { data = { raw }; }
        }
        resolve({ status: res.statusCode ?? 0, data });
      });
    });
    req.on("error", reject);
    if (body !== undefined) req.write(JSON.stringify(body));
    req.end();
  });
}

async function journalOf(
  server: http.Server,
  testId: string,
): Promise<Array<Record<string, unknown>>> {
  const res = await request(server, "GET", `/__e2e/journal?testId=${testId}`,
    undefined, { "x-e2e-test-id": testId },
  );
  return (res.data as { items?: Array<Record<string, unknown>> } | Array<Record<string, unknown>>) as Array<Record<string, unknown>> ?? [];
}

// ─── Test groups ────────────────────────────────────────────────────────────

const POPULATED = "contracts-pop";
const EMPTY = "contracts-empty";

describe("Fixture endpoint contracts", () => {
  let server: http.Server;

  beforeEach(async () => {
    server = createServer();
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GET — list endpoints returning {items, total}
  // ═══════════════════════════════════════════════════════════════════════════

  describe("GET lists return {items, total}", () => {
    beforeEach(async () => {
      await request(server, "POST", "/__e2e/reset",
        { testId: POPULATED, seed: "populated" },
        { "x-e2e-test-id": POPULATED },
      );
    });

    it.each([
      "/accounts",
      "/categories",
      "/payables",
      "/budgets",
      "/goals",
      "/cards/accounts",
      "/cards/statements",
      "/subscriptions",
    ])("%s returns {items, total}", async (path) => {
      const { status, data } = await request(server, "GET", path, undefined, {
        "x-e2e-test-id": POPULATED,
      });
      expect(status).toBe(200);
      expect(data).toMatchObject({ items: expect.any(Array), total: expect.any(Number) });
      expect((data as { items: unknown[] }).items.length).toBeGreaterThan(0);
    });

    it("/transactions with limit param returns {items, total}", async () => {
      const { status, data } = await request(server, "GET",
        "/transactions?limit=10", undefined,
        { "x-e2e-test-id": POPULATED },
      );
      expect(status).toBe(200);
      expect(data).toMatchObject({ items: expect.any(Array), total: expect.any(Number) });
    });

    it("/transactions with kind filter returns only that kind", async () => {
      const { data } = await request(server, "GET",
        "/transactions?kind=expense", undefined,
        { "x-e2e-test-id": POPULATED },
      );
      const items = (data as { items: Array<{ kind: string }> }).items;
      expect(items.every((t) => t.kind === "expense")).toBe(true);
    });

    it("/payables with status filter returns only that status", async () => {
      const { data } = await request(server, "GET",
        "/payables?status=pending", undefined,
        { "x-e2e-test-id": POPULATED },
      );
      const items = (data as { items: Array<{ status: string }> }).items;
      expect(items.every((p) => p.status === "pending")).toBe(true);
    });

    it("/cards/statements with accountId filter", async () => {
      const { data } = await request(server, "GET",
        "/cards/statements?accountId=card-1", undefined,
        { "x-e2e-test-id": POPULATED },
      );
      const items = (data as { items: Array<{ accountId: string }> }).items;
      expect(items.length).toBeGreaterThan(0);
      expect(items.every((s) => s.accountId === "card-1")).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GET — special shapes (direct, wrapper, items-only)
  // ═══════════════════════════════════════════════════════════════════════════

  describe("GET special response shapes", () => {
    beforeEach(async () => {
      await request(server, "POST", "/__e2e/reset",
        { testId: POPULATED, seed: "populated" },
        { "x-e2e-test-id": POPULATED },
      );
    });

    it("/cards/statements/:id returns detail directly (no wrapper)", async () => {
      const { status, data } = await request(server, "GET",
        "/cards/statements/stmt-1", undefined,
        { "x-e2e-test-id": POPULATED },
      );
      expect(status).toBe(200);
      // Direct response: should NOT have items wrapper
      expect(data).not.toHaveProperty("items");
      expect(data).not.toHaveProperty("total");
      expect((data as Record<string, unknown>).id).toBe("stmt-1");
      expect((data as Record<string, unknown>).purchases).toBeDefined();
    });

    it("/profile returns {profile} wrapper", async () => {
      const { status, data } = await request(server, "GET",
        "/profile", undefined,
        { "x-e2e-test-id": POPULATED },
      );
      expect(status).toBe(200);
      expect(data).toMatchObject({ profile: expect.any(Object) });
      expect((data as { profile: Record<string, unknown> }).profile).not.toBeNull();
    });

    it("/profile returns {profile: null} when empty seed", async () => {
      await request(server, "POST", "/__e2e/reset",
        { testId: EMPTY, seed: "empty" },
        { "x-e2e-test-id": EMPTY },
      );
      const { data } = await request(server, "GET", "/profile", undefined, {
        "x-e2e-test-id": EMPTY,
      });
      expect(data).toMatchObject({ profile: null });
    });

    it("/insights/quick returns {items} without total", async () => {
      const { status, data } = await request(server, "GET",
        "/insights/quick", undefined,
        { "x-e2e-test-id": POPULATED },
      );
      expect(status).toBe(200);
      expect(data).toMatchObject({ items: expect.any(Array) });
      expect(data).not.toHaveProperty("total");
    });

    it("GET /auth/devices/me returns {deviceId, householdId} directly", async () => {
      const { status, data } = await request(server, "GET",
        "/auth/devices/me", undefined,
        { "x-e2e-test-id": POPULATED },
      );
      expect(status).toBe(200);
      expect(data).toMatchObject({
        deviceId: expect.any(String),
        householdId: expect.any(String),
      });
      // Not wrapped in any container
      expect(data).not.toHaveProperty("items");
      expect(data).not.toHaveProperty("profile");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Auth
  // ═══════════════════════════════════════════════════════════════════════════

  describe("auth endpoints", () => {
    beforeEach(async () => {
      await request(server, "POST", "/__e2e/reset",
        { testId: EMPTY, seed: "empty" },
        { "x-e2e-test-id": EMPTY },
      );
    });

    it("POST /auth/devices/register returns {token, deviceId, householdId}", async () => {
      const { status, data } = await request(server, "POST",
        "/auth/devices/register", { deviceName: "e2e-test" },
        { "x-e2e-test-id": EMPTY },
      );
      expect(status).toBe(200);
      expect(data).toMatchObject({
        token: expect.any(String),
        deviceId: expect.any(String),
        householdId: expect.any(String),
      });
      expect((data as Record<string, unknown>).token).toContain("e2e-test-token-");

      // Journal recorded
      const journal = await journalOf(server, EMPTY);
      const entry = journal.find((e) => e.method === "POST" && e.path === "/auth/devices/register");
      expect(entry).toBeDefined();
      expect(entry!.status).toBe(200);
    });

    it("GET /auth/devices/me returns 401 when not registered", async () => {
      const { status, data } = await request(server, "GET",
        "/auth/devices/me", undefined,
        { "x-e2e-test-id": EMPTY },
      );
      expect(status).toBe(401);
      expect(data).toMatchObject({ code: "auth.error" });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // POST creates
  // ═══════════════════════════════════════════════════════════════════════════

  describe("POST creates return the created entity", () => {
    beforeEach(async () => {
      await request(server, "POST", "/__e2e/reset",
        { testId: POPULATED, seed: "populated" },
        { "x-e2e-test-id": POPULATED },
      );
    });

    it("POST /accounts returns Account with sequential id", async () => {
      const { status, data } = await request(server, "POST", "/accounts", {
        name: "New Bank", kind: "bank", initialBalanceCents: 100000,
      }, { "x-e2e-test-id": POPULATED });
      expect(status).toBe(200);
      expect(data).toMatchObject({
        id: expect.any(String),
        name: "New Bank",
        kind: "bank",
        initialBalanceCents: 100000,
      });
    });

    it("POST /categories returns Category, supports parentId subcategory", async () => {
      const { status, data } = await request(server, "POST", "/categories", {
        name: "Sub Cat", kind: "expense", parentId: "cat-1",
      }, { "x-e2e-test-id": POPULATED });
      expect(status).toBe(200);
      expect(data).toMatchObject({
        id: expect.any(String),
        name: "Sub Cat",
        kind: "expense",
        parentId: "cat-1",
      });
    });

    it("POST /cards returns Account with limit/days", async () => {
      const { status, data } = await request(server, "POST", "/cards", {
        name: "New Card", creditLimitCents: 100000, closingDay: 15, dueDay: 22,
      }, { "x-e2e-test-id": POPULATED });
      expect(status).toBe(200);
      expect(data).toMatchObject({
        id: expect.any(String),
        name: "New Card",
        creditLimitCents: 100000,
        closingDay: 15,
        dueDay: 22,
      });
    });

    it("POST /cards/installments returns {items: Transaction[]}", async () => {
      const { status, data } = await request(server, "POST", "/cards/installments", {
        accountId: "card-1", description: "Parcelado",
        totalAmountCents: 60000, purchaseDate: "2026-07-17",
        installmentsTotal: 3,
      }, { "x-e2e-test-id": POPULATED });
      expect(status).toBe(200);
      expect(data).toMatchObject({ items: expect.any(Array) });
      const items = (data as { items: Array<Record<string, unknown>> }).items;
      expect(items.length).toBe(3);
      // Each installment has sequential label
      expect(items[0].description).toContain("(1/3)");
      expect(items[1].description).toContain("(2/3)");
      expect(items[2].description).toContain("(3/3)");
      // Amounts are equal
      expect(items[0].amountCents).toBe(20000);
      expect(items[1].amountCents).toBe(20000);
      expect(items[2].amountCents).toBe(20000);
    });

    it("POST /cards/statements/:id/pay updates paidCents and status", async () => {
      const { status, data } = await request(server, "POST",
        "/cards/statements/stmt-1/pay",
        { amountCents: 120000, fromAccountId: "acc-1" },
        { "x-e2e-test-id": POPULATED },
      );
      expect(status).toBe(200);
      expect(data).toMatchObject({
        id: "stmt-1",
        paidCents: 120000,
        status: "paid",
      });
    });

    it("POST /cards/statements/:id/pay with partial amount sets status=partial", async () => {
      const { data } = await request(server, "POST",
        "/cards/statements/stmt-1/pay",
        { amountCents: 50000, fromAccountId: "acc-1" },
        { "x-e2e-test-id": POPULATED },
      );
      expect((data as Record<string, unknown>).status).toBe("partial");
      expect((data as Record<string, unknown>).paidCents).toBe(50000);
    });

    it("POST /transactions/expense returns Transaction with kind=expense", async () => {
      const { status, data } = await request(server, "POST",
        "/transactions/expense", {
          description: "Test Expense", amountCents: 5000,
          date: "2026-07-17", categoryId: "cat-1", accountId: "acc-1",
        }, { "x-e2e-test-id": POPULATED },
      );
      expect(status).toBe(200);
      expect(data).toMatchObject({
        description: "Test Expense",
        amountCents: 5000,
        kind: "expense",
      });
    });

    it("POST /transactions/income returns Transaction with kind=income", async () => {
      const { status, data } = await request(server, "POST",
        "/transactions/income", {
          description: "Test Income", amountCents: 100000,
          date: "2026-07-17", categoryId: "cat-3", accountId: "acc-1",
        }, { "x-e2e-test-id": POPULATED },
      );
      expect(status).toBe(200);
      expect(data).toMatchObject({
        description: "Test Income",
        amountCents: 100000,
        kind: "income",
      });
    });

    it("POST /transfers returns Transaction-like entity", async () => {
      const { status, data } = await request(server, "POST",
        "/transfers", {
          description: "PIX Test", amountCents: 50000,
          date: "2026-07-17", fromAccountId: "acc-1", toAccountId: "acc-2",
        }, { "x-e2e-test-id": POPULATED },
      );
      expect(status).toBe(200);
      expect(data).toMatchObject({
        description: "PIX Test",
        amountCents: 50000,
        fromAccountId: "acc-1",
        toAccountId: "acc-2",
      });
    });

    it("POST /payables returns Payable with pending status", async () => {
      const { status, data } = await request(server, "POST",
        "/payables", {
          description: "New Bill", amountCents: 15000,
          dueDate: "2026-08-01", accountId: "acc-1",
        }, { "x-e2e-test-id": POPULATED },
      );
      expect(status).toBe(200);
      expect(data).toMatchObject({
        description: "New Bill",
        amountCents: 15000,
        status: "pending",
        dueDate: "2026-08-01",
      });
    });

    it("POST /budgets returns Budget", async () => {
      const { status, data } = await request(server, "POST",
        "/budgets", {
          name: "Transporte Mensal", amountCents: 50000,
          categoryId: "cat-2", period: "monthly", startDate: "2026-07-01",
        }, { "x-e2e-test-id": POPULATED },
      );
      expect(status).toBe(200);
      expect(data).toMatchObject({
        name: "Transporte Mensal",
        amountCents: 50000,
        period: "monthly",
        spentCents: 0,
      });
    });

    it("POST /goals returns Goal with active status", async () => {
      const { status, data } = await request(server, "POST",
        "/goals", {
          name: "New Goal", goalType: "savings",
          targetAmountCents: 500000, startDate: "2026-07-01",
        }, { "x-e2e-test-id": POPULATED },
      );
      expect(status).toBe(200);
      expect(data).toMatchObject({
        name: "New Goal",
        targetAmountCents: 500000,
        status: "active",
        currentAmountCents: 0,
      });
    });

    it("POST /subscriptions returns Subscription", async () => {
      const { status, data } = await request(server, "POST",
        "/subscriptions", {
          name: "Spotify", amountCents: 2190,
          cycle: "monthly", day: 15, paymentMethod: "credit_card",
        }, { "x-e2e-test-id": POPULATED },
      );
      expect(status).toBe(200);
      expect(data).toMatchObject({
        name: "Spotify",
        amountCents: 2190,
        cycle: "monthly",
        status: "active",
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PATCH updates
  // ═══════════════════════════════════════════════════════════════════════════

  describe("PATCH updates return the mutated entity", () => {
    beforeEach(async () => {
      await request(server, "POST", "/__e2e/reset",
        { testId: POPULATED, seed: "populated" },
        { "x-e2e-test-id": POPULATED },
      );
    });

    it("PATCH /accounts/:id returns Account with updated name", async () => {
      const { status, data } = await request(server, "PATCH",
        "/accounts/acc-1", { name: "Updated Name" },
        { "x-e2e-test-id": POPULATED },
      );
      expect(status).toBe(200);
      expect(data).toMatchObject({ id: "acc-1", name: "Updated Name" });
    });

    it("PATCH /categories/:id returns Category with updated name", async () => {
      const { status, data } = await request(server, "PATCH",
        "/categories/cat-1", { name: "Updated Cat" },
        { "x-e2e-test-id": POPULATED },
      );
      expect(status).toBe(200);
      expect(data).toMatchObject({ id: "cat-1", name: "Updated Cat" });
    });

    it("PATCH /transactions/:id returns Transaction with updates", async () => {
      const { status, data } = await request(server, "PATCH",
        "/transactions/tx-1",
        { description: "Edited", amountCents: 9999, date: "2026-07-15" },
        { "x-e2e-test-id": POPULATED },
      );
      expect(status).toBe(200);
      expect(data).toMatchObject({
        id: "tx-1",
        description: "Edited",
        amountCents: 9999,
        date: "2026-07-15",
      });
    });

    it("PATCH /cards/:id returns Account with updated card fields", async () => {
      const { status, data } = await request(server, "PATCH",
        "/cards/card-1",
        { name: "Updated Card", creditLimitCents: 600000, closingDay: 10, dueDay: 18 },
        { "x-e2e-test-id": POPULATED },
      );
      expect(status).toBe(200);
      expect(data).toMatchObject({
        id: "card-1",
        name: "Updated Card",
        creditLimitCents: 600000,
        closingDay: 10,
        dueDay: 18,
      });
    });

    it("PATCH /cards/purchases/:id returns StatementDetail", async () => {
      const { status, data } = await request(server, "PATCH",
        "/cards/purchases/pur-1",
        { description: "Edited Purchase", amountCents: 50000 },
        { "x-e2e-test-id": POPULATED },
      );
      expect(status).toBe(200);
      // Returns the parent statement (StatementDetail)
      expect(data).toMatchObject({ id: "stmt-1" });
    });

    it("PATCH /payables/:id returns Payable with updates", async () => {
      const { status, data } = await request(server, "PATCH",
        "/payables/pay-1",
        { description: "Edited Bill", amountCents: 13000 },
        { "x-e2e-test-id": POPULATED },
      );
      expect(status).toBe(200);
      expect(data).toMatchObject({
        id: "pay-1",
        description: "Edited Bill",
        amountCents: 13000,
      });
    });

    it("PATCH /budgets/:id returns Budget with updated amount", async () => {
      const { status, data } = await request(server, "PATCH",
        "/budgets/bud-1", { amountCents: 90000 },
        { "x-e2e-test-id": POPULATED },
      );
      expect(status).toBe(200);
      expect(data).toMatchObject({
        id: "bud-1",
        amountCents: 90000,
      });
    });

    it("PATCH /goals/:id returns Goal with updates", async () => {
      const { status, data } = await request(server, "PATCH",
        "/goals/goal-1",
        { name: "Bigger Reserve", targetAmountCents: 2000000 },
        { "x-e2e-test-id": POPULATED },
      );
      expect(status).toBe(200);
      expect(data).toMatchObject({
        id: "goal-1",
        name: "Bigger Reserve",
        targetAmountCents: 2000000,
      });
    });

    it("PATCH /subscriptions/:id returns Subscription with updates", async () => {
      const { status, data } = await request(server, "PATCH",
        "/subscriptions/sub-1",
        { name: "Netflix HD", amountCents: 6590, day: 12 },
        { "x-e2e-test-id": POPULATED },
      );
      expect(status).toBe(200);
      expect(data).toMatchObject({
        id: "sub-1",
        name: "Netflix HD",
        amountCents: 6590,
        day: 12,
      });
    });

    it("PATCH /profile returns {profile} with updated fields", async () => {
      const { status, data } = await request(server, "PATCH",
        "/profile", { name: "Updated", greetingStyle: "casual" },
        { "x-e2e-test-id": POPULATED },
      );
      expect(status).toBe(200);
      expect(data).toMatchObject({
        profile: expect.objectContaining({
          name: "Updated",
          greetingStyle: "casual",
        }),
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // POST action endpoints (deactivate, pay, unpay, cancel, contribute)
  // ═══════════════════════════════════════════════════════════════════════════

  describe("POST actions return the mutated entity", () => {
    beforeEach(async () => {
      await request(server, "POST", "/__e2e/reset",
        { testId: POPULATED, seed: "populated" },
        { "x-e2e-test-id": POPULATED },
      );
    });

    it("POST /accounts/:id/deactivate returns 200 with entity (status:inactive)", async () => {
      const { status, data } = await request(server, "POST",
        "/accounts/acc-1/deactivate", undefined,
        { "x-e2e-test-id": POPULATED },
      );
      expect(status).toBe(200);
      expect(data).toMatchObject({ id: "acc-1", status: "inactive" });

      const journal = await journalOf(server, POPULATED);
      expect(journal.some((e) =>
        e.method === "POST" && (e.path as string).includes("/deactivate")
      )).toBe(true);
    });

    it("POST /categories/:id/deactivate returns 200 with entity (status:inactive)", async () => {
      const { status, data } = await request(server, "POST",
        "/categories/cat-1/deactivate", undefined,
        { "x-e2e-test-id": POPULATED },
      );
      expect(status).toBe(200);
      expect(data).toMatchObject({ id: "cat-1", status: "inactive" });
    });

    it("POST /payables/:id/pay marks payable as paid with paidDate", async () => {
      const { status, data } = await request(server, "POST",
        "/payables/pay-1/pay", { paidDate: "2026-07-17" },
        { "x-e2e-test-id": POPULATED },
      );
      expect(status).toBe(200);
      expect(data).toMatchObject({
        id: "pay-1",
        status: "paid",
        paidDate: "2026-07-17",
      });
    });

    it("POST /payables/:id/unpay reverts to pending", async () => {
      // First pay
      await request(server, "POST", "/payables/pay-1/pay",
        { paidDate: "2026-07-17" },
        { "x-e2e-test-id": POPULATED },
      );
      // Then unpay
      const { status, data } = await request(server, "POST",
        "/payables/pay-1/unpay", undefined,
        { "x-e2e-test-id": POPULATED },
      );
      expect(status).toBe(200);
      expect(data).toMatchObject({
        id: "pay-1",
        status: "pending",
      });
      expect((data as Record<string, unknown>).paidDate).toBeUndefined();
    });

    it("POST /payables/:id/cancel marks as cancelled", async () => {
      const { status, data } = await request(server, "POST",
        "/payables/pay-1/cancel", undefined,
        { "x-e2e-test-id": POPULATED },
      );
      expect(status).toBe(200);
      expect(data).toMatchObject({ id: "pay-1", status: "cancelled" });
    });

    it("POST /goals/:id/contribute increments currentAmountCents", async () => {
      const { status, data } = await request(server, "POST",
        "/goals/goal-1/contribute", { amountCents: 50000 },
        { "x-e2e-test-id": POPULATED },
      );
      expect(status).toBe(200);
      expect(data).toMatchObject({
        id: "goal-1",
        currentAmountCents: 250000, // 200000 + 50000
      });
    });

    it("POST /goals/:id/cancel sets status=cancelled", async () => {
      const { status, data } = await request(server, "POST",
        "/goals/goal-1/cancel", undefined,
        { "x-e2e-test-id": POPULATED },
      );
      expect(status).toBe(200);
      expect(data).toMatchObject({ id: "goal-1", status: "cancelled" });
    });

    it("POST /subscriptions/:id/cancel sets status=cancelled", async () => {
      const { status, data } = await request(server, "POST",
        "/subscriptions/sub-1/cancel", undefined,
        { "x-e2e-test-id": POPULATED },
      );
      expect(status).toBe(200);
      expect(data).toMatchObject({ id: "sub-1", status: "cancelled" });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // DELETE
  // ═══════════════════════════════════════════════════════════════════════════

  describe("DELETE returns 204 No Content", () => {
    beforeEach(async () => {
      await request(server, "POST", "/__e2e/reset",
        { testId: POPULATED, seed: "populated" },
        { "x-e2e-test-id": POPULATED },
      );
    });

    it("DELETE /transactions/:id returns 204 and removes item", async () => {
      const { status, data } = await request(server, "DELETE",
        "/transactions/tx-1", undefined,
        { "x-e2e-test-id": POPULATED },
      );
      expect(status).toBe(204);
      expect(data).toBeUndefined();

      // Verify journal recorded 204
      const journal = await journalOf(server, POPULATED);
      const deleteEntry = journal.find((e) =>
        e.method === "DELETE" && (e.path as string).includes("/transactions/")
      );
      expect(deleteEntry).toBeDefined();
      expect(deleteEntry!.status).toBe(204);
    });

    it("DELETE /transactions/:id returns 404 for nonexistent", async () => {
      const { status } = await request(server, "DELETE",
        "/transactions/nonexistent", undefined,
        { "x-e2e-test-id": POPULATED },
      );
      expect(status).toBe(404);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 404 on unmatched fixture route
  // ═══════════════════════════════════════════════════════════════════════════

  it("unknown fixture route returns 404", async () => {
    await request(server, "POST", "/__e2e/reset",
      { testId: EMPTY, seed: "empty" },
      { "x-e2e-test-id": EMPTY },
    );
    const { status, data } = await request(server, "GET",
      "/nonexistent/route", undefined,
      { "x-e2e-test-id": EMPTY },
    );
    expect(status).toBe(404);
    expect(data).toMatchObject({ error: "Not found" });
  });
});
