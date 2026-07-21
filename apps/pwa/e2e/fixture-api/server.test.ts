/**
 * Protocol tests for the fixture API server.
 * Tests run against an in-memory server instance (port 0 = OS-assigned).
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import http from "node:http";
import { createServer } from "./server";
import type { SeedData } from "./store";

// ─── Test helpers (typed request) ────────────────────────────────────────────

interface HttpResponse {
  status: number;
  data: unknown;
  headers: Record<string, string | string[] | undefined>;
}

function request(
  server: http.Server,
  method: string,
  path: string,
  body?: unknown,
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
        let data: unknown = undefined;
        try {
          data = raw ? JSON.parse(raw) : undefined;
        } catch {
          data = raw;
        }
        resolve({
          status: res.statusCode ?? 0,
          data,
          headers: res.headers,
        });
      });
    });
    req.on("error", (err) => {
      // Expected for offline/abort scenarios
      reject(err);
    });
    if (body !== undefined) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

// Extract JSON response data with type safety
function responseData<T>(res: HttpResponse): T {
  return res.data as T;
}

// ─── Server lifecycle ────────────────────────────────────────────────────────

describe("Fixture API protocol", () => {
  let server: http.Server;

  beforeEach(async () => {
    server = createServer(0);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  // ── Health (no auth, no journal) ──────────────────────────────────────────

  it("GET /__e2e/health returns {ok:true} without X-E2E-Test-ID", async () => {
    const res = await request(server, "GET", "/__e2e/health");
    expect(res.status).toBe(200);
    expect(responseData<{ ok: boolean }>(res)).toEqual({ ok: true });
  });

  it("health does not create a journal entry", async () => {
    // Health should NOT require or affect journal
    await request(server, "GET", "/__e2e/health");

    // GET /__e2e/journal without a testId should 400 (not valid for journal)
    const res = await request(server, "GET", "/__e2e/journal?testId=any");
    expect(res.status).toBe(400);
  });

  // ── Missing X-E2E-Test-ID ─────────────────────────────────────────────────

  it("returns 400 for missing X-E2E-Test-ID on fixture routes", async () => {
    const res = await request(server, "GET", "/accounts");
    expect(res.status).toBe(400);
    expect(responseData<{ error: string }>(res).error).toContain("Missing X-E2E-Test-ID");
  });

  it("returns 400 for missing X-E2E-Test-ID on /__e2e/seed", async () => {
    const res = await request(server, "GET", "/__e2e/seed?testId=no-header");
    expect(res.status).toBe(400);
    expect(responseData<{ error: string }>(res).error).toContain("Missing X-E2E-Test-ID");
  });

  it("returns 400 for missing X-E2E-Test-ID on /__e2e/reset without body testId", async () => {
    const res = await request(server, "POST", "/__e2e/reset", { seed: "populated" });
    expect(res.status).toBe(400);
    expect(responseData<{ error: string }>(res).error).toContain("Missing X-E2E-Test-ID");
  });

  // ── Reset isolation ───────────────────────────────────────────────────────

  it("reset creates isolated store for testId", async () => {
    const res = await request(server, "POST", "/__e2e/reset",
      { testId: "iso-a", seed: "populated" },
      { "x-e2e-test-id": "iso-a" },
    );
    expect(res.status).toBe(200);
  });

  it("reset returns ok with testId and seed name", async () => {
    const res = await request(server, "POST", "/__e2e/reset",
      { testId: "info-test", seed: "empty" },
      { "x-e2e-test-id": "info-test" },
    );
    expect(res.status).toBe(200);
    const data = responseData<{ ok: boolean; testId: string; seed: string }>(res);
    expect(data.ok).toBe(true);
    expect(data.testId).toBe("info-test");
    expect(data.seed).toBe("empty");
  });

  it("resets only the requested test store", async () => {
    await request(server, "POST", "/__e2e/reset", { testId: "a", seed: "populated" }, { "x-e2e-test-id": "a" });
    await request(server, "POST", "/__e2e/reset", { testId: "b", seed: "empty" }, { "x-e2e-test-id": "b" });

    const seedA = responseData<SeedData>(await request(server, "GET", "/__e2e/seed?testId=a", undefined, { "x-e2e-test-id": "a" }));
    const seedB = responseData<SeedData>(await request(server, "GET", "/__e2e/seed?testId=b", undefined, { "x-e2e-test-id": "b" }));

    expect(seedA.accounts.length).toBeGreaterThan(0);
    expect(seedB.accounts).toEqual([]);
  });

  it("reset clears journal for that store only", async () => {
    const testId = "journal-clear";
    await request(server, "POST", "/__e2e/reset", { testId, seed: "populated" }, { "x-e2e-test-id": testId });

    // Make some requests
    await request(server, "GET", "/accounts", undefined, { "x-e2e-test-id": testId });
    await request(server, "GET", "/categories", undefined, { "x-e2e-test-id": testId });

    const journalBefore = responseData<Array<unknown>>(
      await request(server, "GET", "/__e2e/journal?testId=journal-clear", undefined, { "x-e2e-test-id": testId }),
    );
    expect(journalBefore.length).toBe(2);

    // Reset
    await request(server, "POST", "/__e2e/reset", { testId, seed: "populated" }, { "x-e2e-test-id": testId });

    const journalAfter = responseData<Array<unknown>>(
      await request(server, "GET", "/__e2e/journal?testId=journal-clear", undefined, { "x-e2e-test-id": testId }),
    );
    expect(journalAfter.length).toBe(0);
  });

  it("seed persists between resets (independent stores)", async () => {
    await request(server, "POST", "/__e2e/reset", { testId: "seed-a", seed: "populated" }, { "x-e2e-test-id": "seed-a" });
    await request(server, "POST", "/__e2e/reset", { testId: "seed-b", seed: "empty" }, { "x-e2e-test-id": "seed-b" });

    // Re-reset seed-a with populated
    await request(server, "POST", "/__e2e/reset", { testId: "seed-a", seed: "populated" }, { "x-e2e-test-id": "seed-a" });

    const seedA = responseData<SeedData>(
      await request(server, "GET", "/__e2e/seed?testId=seed-a", undefined, { "x-e2e-test-id": "seed-a" }),
    );
    expect(seedA.accounts.length).toBeGreaterThan(0);
  });

  // ── CORS and preflight ────────────────────────────────────────────────────

  it("CORS headers are set on response", async () => {
    const res = await request(server, "GET", "/__e2e/health");
    expect(res.headers["access-control-allow-origin"]).toBe("http://127.0.0.1:3000");
    expect(res.headers["access-control-allow-methods"]).toBe("GET,POST,PATCH,DELETE,OPTIONS");
    expect(res.headers["access-control-allow-headers"]).toBe("content-type,authorization,x-e2e-test-id,x-device-token");
  });

  it("OPTIONS preflight returns 204 with proper CORS headers", async () => {
    const port = (server.address() as { port: number }).port;
    const res = await new Promise<http.IncomingMessage>((resolve, reject) => {
      const req = http.request({
        method: "OPTIONS",
        path: "/__e2e/health",
        hostname: "127.0.0.1",
        port,
        headers: {
          origin: "http://127.0.0.1:3000",
          "access-control-request-method": "POST",
        },
      }, (response) => resolve(response));
      req.on("error", reject);
      req.end();
    });

    expect(res.statusCode).toBe(204);
    expect(res.headers["access-control-allow-origin"]).toBe("http://127.0.0.1:3000");
    expect(res.headers["access-control-allow-methods"]).toBe("GET,POST,PATCH,DELETE,OPTIONS");
  });

  // ── Scenario: status codes (401, 422, 500) ────────────────────────────────

  it("scenario with status 422 returns that status and error shape", async () => {
    const testId = "s-422";
    await request(server, "POST", "/__e2e/reset", { testId, seed: "empty" }, { "x-e2e-test-id": testId });
    await request(server, "POST", "/__e2e/scenario", {
      testId, method: "POST", pathname: "/transactions/expense", status: 422,
    }, { "x-e2e-test-id": testId });

    const res = await request(server, "POST", "/transactions/expense",
      { description: "x", amountCents: 0, categoryId: "", accountId: "", date: "2026-07-17" },
      { "x-e2e-test-id": testId },
    );
    expect(res.status).toBe(422);
    const data = responseData<Record<string, unknown>>(res);
    expect(data.error).toBeDefined();
    expect(data.code).toBe("scenario.error");
  });

  it("scenario with status 401 returns 401", async () => {
    const testId = "s-401";
    await request(server, "POST", "/__e2e/reset", { testId, seed: "empty" }, { "x-e2e-test-id": testId });
    await request(server, "POST", "/__e2e/scenario", {
      testId, method: "GET", pathname: "/accounts", status: 401,
    }, { "x-e2e-test-id": testId });

    const res = await request(server, "GET", "/accounts", undefined, { "x-e2e-test-id": testId });
    expect(res.status).toBe(401);
  });

  it("scenario with status 500 returns 500", async () => {
    const testId = "s-500";
    await request(server, "POST", "/__e2e/reset", { testId, seed: "empty" }, { "x-e2e-test-id": testId });
    await request(server, "POST", "/__e2e/scenario", {
      testId, method: "GET", pathname: "/categories", status: 500,
    }, { "x-e2e-test-id": testId });

    const res = await request(server, "GET", "/categories", undefined, { "x-e2e-test-id": testId });
    expect(res.status).toBe(500);
  });

  // ── Scenario: delay ───────────────────────────────────────────────────────

  it("scenario with delayMs waits before responding", async () => {
    const testId = "delay";
    await request(server, "POST", "/__e2e/reset", { testId, seed: "empty" }, { "x-e2e-test-id": testId });
    await request(server, "POST", "/__e2e/scenario", {
      testId, method: "GET", pathname: "/accounts", delayMs: 100,
    }, { "x-e2e-test-id": testId });

    const start = Date.now();
    await request(server, "GET", "/accounts", undefined, { "x-e2e-test-id": testId });
    expect(Date.now() - start).toBeGreaterThanOrEqual(90);
  });

  // ── Scenario: offline (socket abort) ─────────────────────────────────────

  it("scenario with offline destroys socket (no response)", async () => {
    const testId = "offline";
    await request(server, "POST", "/__e2e/reset", { testId, seed: "empty" }, { "x-e2e-test-id": testId });
    await request(server, "POST", "/__e2e/scenario", {
      testId, method: "GET", pathname: "/accounts", offline: true,
    }, { "x-e2e-test-id": testId });

    // Expect connection to be destroyed (request fails)
    await expect(
      request(server, "GET", "/accounts", undefined, { "x-e2e-test-id": testId }),
    ).rejects.toThrow();
  });

  // ── Scenario: once (single-use) ──────────────────────────────────────────

  it("scenario with once is used only once then falls through to fixture data", async () => {
    const testId = "once";
    await request(server, "POST", "/__e2e/reset", { testId, seed: "populated" }, { "x-e2e-test-id": testId });
    await request(server, "POST", "/__e2e/scenario", {
      testId, method: "GET", pathname: "/accounts", status: 500, once: true,
    }, { "x-e2e-test-id": testId });

    // First request matches scenario → 500
    const r1 = await request(server, "GET", "/accounts", undefined, { "x-e2e-test-id": testId });
    expect(r1.status).toBe(500);

    // Second request falls through to fixture → 200 with items
    const r2 = await request(server, "GET", "/accounts", undefined, { "x-e2e-test-id": testId });
    expect(r2.status).toBe(200);
    expect(responseData<{ items: unknown[] }>(r2).items).toBeDefined();
  });

  it("non-once scenario matches every request", async () => {
    const testId = "repeat";
    await request(server, "POST", "/__e2e/reset", { testId, seed: "empty" }, { "x-e2e-test-id": testId });
    await request(server, "POST", "/__e2e/scenario", {
      testId, method: "GET", pathname: "/accounts", status: 422,
    }, { "x-e2e-test-id": testId });

    const r1 = await request(server, "GET", "/accounts", undefined, { "x-e2e-test-id": testId });
    expect(r1.status).toBe(422);

    const r2 = await request(server, "GET", "/accounts", undefined, { "x-e2e-test-id": testId });
    expect(r2.status).toBe(422);
  });

  // ── Scenario: normalized pathname + search ────────────────────────────────

  it("scenario matches pathname with trailing slash stripped", async () => {
    const testId = "trailing";
    await request(server, "POST", "/__e2e/reset", { testId, seed: "empty" }, { "x-e2e-test-id": testId });
    // Scenario pathname without trailing slash
    await request(server, "POST", "/__e2e/scenario", {
      testId, method: "GET", pathname: "/accounts", status: 418,
    }, { "x-e2e-test-id": testId });

    // Request with trailing slash should still match
    const res = await request(server, "GET", "/accounts/", undefined, { "x-e2e-test-id": testId });
    expect(res.status).toBe(418);
  });

  it("scenario matches pathname from rule with trailing slash stripped", async () => {
    const testId = "trailing-rule";
    await request(server, "POST", "/__e2e/reset", { testId, seed: "empty" }, { "x-e2e-test-id": testId });
    // Scenario pathname WITH trailing slash
    await request(server, "POST", "/__e2e/scenario", {
      testId, method: "GET", pathname: "/categories/", status: 418,
    }, { "x-e2e-test-id": testId });

    // Request without trailing slash should still match
    const res = await request(server, "GET", "/categories", undefined, { "x-e2e-test-id": testId });
    expect(res.status).toBe(418);
  });

  it("scenario matches exact search params", async () => {
    const testId = "search";
    await request(server, "POST", "/__e2e/reset", { testId, seed: "populated" }, { "x-e2e-test-id": testId });
    await request(server, "POST", "/__e2e/scenario", {
      testId, method: "GET", pathname: "/transactions", search: "limit=10", status: 500,
    }, { "x-e2e-test-id": testId });

    // Request with matching search should hit scenario
    const res1 = await request(server, "GET", "/transactions?limit=10", undefined, { "x-e2e-test-id": testId });
    expect(res1.status).toBe(500);

    // Request without search should not match scenario
    const res2 = await request(server, "GET", "/transactions", undefined, { "x-e2e-test-id": testId });
    expect(res2.status).toBe(200);
  });

  it("scenario without search matches any search params", async () => {
    const testId = "no-search";
    await request(server, "POST", "/__e2e/reset", { testId, seed: "empty" }, { "x-e2e-test-id": testId });
    await request(server, "POST", "/__e2e/scenario", {
      testId, method: "GET", pathname: "/payables", status: 422,
    }, { "x-e2e-test-id": testId });

    const res = await request(server, "GET", "/payables?status=pending", undefined, { "x-e2e-test-id": testId });
    expect(res.status).toBe(422);
  });

  // ── Journal exactness ──────────────────────────────────────────────────────

  it("journal records method, path, body and status for each request", async () => {
    const testId = "journal-exact";
    await request(server, "POST", "/__e2e/reset", { testId, seed: "populated" }, { "x-e2e-test-id": testId });

    await request(server, "GET", "/accounts", undefined, { "x-e2e-test-id": testId });
    await request(server, "GET", "/categories", undefined, { "x-e2e-test-id": testId });
    await request(server, "POST", "/transactions/expense",
      { description: "JournalTest", amountCents: 1000, date: "2026-07-17", categoryId: "cat-1", accountId: "acc-1" },
      { "x-e2e-test-id": testId },
    );

    const journal = responseData<Array<{ method: string; path: string; body: unknown; status: number }>>(
      await request(server, "GET", "/__e2e/journal?testId=journal-exact", undefined, { "x-e2e-test-id": testId }),
    );

    expect(journal.length).toBe(3);
    expect(journal[0]).toMatchObject({ method: "GET", path: "/accounts", status: 200 });
    expect(journal[1]).toMatchObject({ method: "GET", path: "/categories", status: 200 });
    expect(journal[2]).toMatchObject({ method: "POST", path: "/transactions/expense", status: 200 });
    // Body should be recorded (may be parsed JSON)
    expect(journal[2].body).toBeDefined();
  });

  it("journal is scoped per testId", async () => {
    await request(server, "POST", "/__e2e/reset", { testId: "j-a", seed: "populated" }, { "x-e2e-test-id": "j-a" });
    await request(server, "POST", "/__e2e/reset", { testId: "j-b", seed: "populated" }, { "x-e2e-test-id": "j-b" });

    await request(server, "GET", "/accounts", undefined, { "x-e2e-test-id": "j-a" });
    await request(server, "GET", "/categories", undefined, { "x-e2e-test-id": "j-b" });

    const journalA = responseData<Array<unknown>>(
      await request(server, "GET", "/__e2e/journal?testId=j-a", undefined, { "x-e2e-test-id": "j-a" }),
    );
    const journalB = responseData<Array<unknown>>(
      await request(server, "GET", "/__e2e/journal?testId=j-b", undefined, { "x-e2e-test-id": "j-b" }),
    );

    expect(journalA.length).toBe(1);
    expect(journalB.length).toBe(1);
    expect(journalA).not.toEqual(journalB);
  });

  // ── Scenario records journal entry ─────────────────────────────────────────

  it("scenario response is recorded in journal", async () => {
    const testId = "s-journal";
    await request(server, "POST", "/__e2e/reset", { testId, seed: "empty" }, { "x-e2e-test-id": testId });
    await request(server, "POST", "/__e2e/scenario", {
      testId, method: "GET", pathname: "/accounts", status: 503,
    }, { "x-e2e-test-id": testId });

    await request(server, "GET", "/accounts", undefined, { "x-e2e-test-id": testId });

    const journal = responseData<Array<{ method: string; path: string; status: number }>>(
      await request(server, "GET", "/__e2e/journal?testId=s-journal", undefined, { "x-e2e-test-id": testId }),
    );
    expect(journal.length).toBe(1);
    expect(journal[0].method).toBe("GET");
    expect(journal[0].path).toBe("/accounts");
    expect(journal[0].status).toBe(503);
  });

  // ── Fixture responses ──────────────────────────────────────────────────────

  it("GET /accounts returns {items, total} with populated seed", async () => {
    const testId = "list";
    await request(server, "POST", "/__e2e/reset", { testId, seed: "populated" }, { "x-e2e-test-id": testId });

    const res = await request(server, "GET", "/accounts", undefined, { "x-e2e-test-id": testId });
    expect(res.status).toBe(200);
    const data = responseData<{ items: unknown[]; total: number }>(res);
    expect(Array.isArray(data.items)).toBe(true);
    expect(typeof data.total).toBe("number");
    expect(data.items.length).toBe(2);
  });

  it("DELETE /transactions/:id returns 204 No Content", async () => {
    const testId = "del";
    await request(server, "POST", "/__e2e/reset", { testId, seed: "populated" }, { "x-e2e-test-id": testId });

    const res = await request(server, "DELETE", "/transactions/tx-1", undefined, { "x-e2e-test-id": testId });
    expect(res.status).toBe(204);
    expect(res.data).toBeUndefined();
  });

  it("POST /auth/devices/register returns {token,deviceId,householdId}", async () => {
    const testId = "auth-reg";
    await request(server, "POST", "/__e2e/reset", { testId, seed: "populated" }, { "x-e2e-test-id": testId });

    const res = await request(server, "POST", "/auth/devices/register",
      { deviceName: "e2e-test" },
      { "x-e2e-test-id": testId },
    );
    expect(res.status).toBe(200);
    const data = responseData<{ token: string; deviceId: string; householdId: string }>(res);
    expect(typeof data.token).toBe("string");
    expect(data.token.length).toBeGreaterThan(0);
    expect(typeof data.deviceId).toBe("string");
    expect(typeof data.householdId).toBe("string");
  });

  // ── 404 on unknown fixture route ──────────────────────────────────────────

  it("unknown fixture route returns 404", async () => {
    const testId = "notfound";
    await request(server, "POST", "/__e2e/reset", { testId, seed: "empty" }, { "x-e2e-test-id": testId });

    const res = await request(server, "GET", "/nonexistent/route", undefined, { "x-e2e-test-id": testId });
    expect(res.status).toBe(404);
    expect(responseData<{ error: string }>(res).error).toBe("Not found");
  });
});
