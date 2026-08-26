import { describe, it, expect, beforeEach } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import {
  createInMemoryShadowDivergenceStore,
  type ShadowDivergenceStore,
} from "../../src/observability/shadow-divergence.js";
import { registerShadowObservabilityRoutes } from "../../src/routes/shadow-observability.js";
import { createInMemoryDeviceTokenStore, DEVICE_TOKEN_HEADER } from "../../src/auth/device-token.js";

const VALID_HASH_A = "a".repeat(64);
const VALID_HASH_B = "b".repeat(64);
const VALID_HASH_C = "c".repeat(64);

describe("Shadow Divergence Store (In-Memory)", () => {
  let store: ShadowDivergenceStore;

  beforeEach(() => {
    store = createInMemoryShadowDivergenceStore();
  });

  it("records sanitized shadow divergence events with stable hashes", async () => {
    const event = await store.recordEvent({
      workspaceId: "workspace-1",
      capability: "list_accounts",
      outcome: "match",
      requestHash: VALID_HASH_A,
      apiHash: VALID_HASH_B,
      legacyHash: VALID_HASH_B,
      durationMs: 45,
    });

    expect(event.id).toBeDefined();
    expect(event.workspaceId).toBe("workspace-1");
    expect(event.capability).toBe("list_accounts");
    expect(event.outcome).toBe("match");
    expect(event.requestHash).toBe(VALID_HASH_A);
    expect(event.apiHash).toBe(VALID_HASH_B);
    expect(event.legacyHash).toBe(VALID_HASH_B);
    expect(event.durationMs).toBe(45);
    expect(event.createdAt).toBeDefined();
  });

  it("computes capability summaries with accurate counts and rates", async () => {
    await store.recordEvent({
      workspaceId: "workspace-1",
      capability: "list_accounts",
      outcome: "match",
      requestHash: VALID_HASH_A,
      durationMs: 10,
    });
    await store.recordEvent({
      workspaceId: "workspace-1",
      capability: "list_accounts",
      outcome: "divergence",
      requestHash: VALID_HASH_A,
      apiHash: VALID_HASH_B,
      legacyHash: VALID_HASH_C,
      durationMs: 15,
    });
    await store.recordEvent({
      workspaceId: "workspace-1",
      capability: "get_balance",
      outcome: "legacy_error",
      requestHash: VALID_HASH_A,
      error: "database timeout",
      durationMs: 50,
    });

    const summaries = await store.getSummary("workspace-1");
    expect(summaries).toHaveLength(2);

    const getBalance = summaries.find((s) => s.capability === "get_balance")!;
    expect(getBalance.totalRuns).toBe(1);
    expect(getBalance.legacyErrors).toBe(1);
    expect(getBalance.divergenceRate).toBe(0);

    const listAccounts = summaries.find((s) => s.capability === "list_accounts")!;
    expect(listAccounts.totalRuns).toBe(2);
    expect(listAccounts.matches).toBe(1);
    expect(listAccounts.divergences).toBe(1);
    expect(listAccounts.divergenceRate).toBe(0.5);
  });

  it("strictly scopes summaries and event listings to the requested workspace", async () => {
    await store.recordEvent({
      workspaceId: "workspace-A",
      capability: "list_accounts",
      outcome: "divergence",
      requestHash: VALID_HASH_A,
      durationMs: 20,
    });
    await store.recordEvent({
      workspaceId: "workspace-B",
      capability: "list_accounts",
      outcome: "match",
      requestHash: VALID_HASH_A,
      durationMs: 20,
    });

    const summaryA = await store.getSummary("workspace-A");
    expect(summaryA).toHaveLength(1);
    expect(summaryA[0]!.divergences).toBe(1);
    expect(summaryA[0]!.matches).toBe(0);

    const summaryB = await store.getSummary("workspace-B");
    expect(summaryB).toHaveLength(1);
    expect(summaryB[0]!.divergences).toBe(0);
    expect(summaryB[0]!.matches).toBe(1);

    const eventsA = await store.listEvents("workspace-A");
    expect(eventsA).toHaveLength(1);
    expect(eventsA[0]!.workspaceId).toBe("workspace-A");

    const eventsB = await store.listEvents("workspace-B");
    expect(eventsB).toHaveLength(1);
    expect(eventsB[0]!.workspaceId).toBe("workspace-B");
  });
});

describe("Shadow Observability HTTP Routes", () => {
  let app: FastifyInstance;
  let store: ShadowDivergenceStore;
  let tokenStore: ReturnType<typeof createInMemoryDeviceTokenStore>;
  let validToken: string;

  beforeEach(async () => {
    app = Fastify();
    store = createInMemoryShadowDivergenceStore();
    tokenStore = createInMemoryDeviceTokenStore();
    validToken = (await tokenStore.register("Test Runner", "workspace-1")).token;

    registerShadowObservabilityRoutes(app, {
      shadowDivergence: store,
      resolveToken: async (token) => tokenStore.resolve(token),
    });
    await app.ready();
  });

  it("records a valid divergence event via POST /observability/shadow-divergence", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/observability/shadow-divergence",
      headers: {
        [DEVICE_TOKEN_HEADER]: validToken,
      },
      payload: {
        capability: "list_accounts",
        outcome: "divergence",
        requestHash: VALID_HASH_A,
        apiHash: VALID_HASH_B,
        legacyHash: VALID_HASH_C,
        durationMs: 42,
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.event.workspaceId).toBe("workspace-1");
    expect(body.event.capability).toBe("list_accounts");
    expect(body.event.outcome).toBe("divergence");
  });

  it("rejects unauthorized requests without a valid token", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/observability/shadow-divergence",
      payload: {
        capability: "list_accounts",
        outcome: "match",
        requestHash: VALID_HASH_A,
        durationMs: 10,
      },
    });

    expect(res.statusCode).toBe(401);
  });

  it("rejects payloads containing extra/raw financial fields (strict validation)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/observability/shadow-divergence",
      headers: {
        [DEVICE_TOKEN_HEADER]: validToken,
      },
      payload: {
        capability: "list_accounts",
        outcome: "match",
        requestHash: VALID_HASH_A,
        durationMs: 10,
        rawPayload: { amountCents: 5000, description: "Salário" },
      },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe("validation.error");
  });

  it("rejects invalid hash formats with 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/observability/shadow-divergence",
      headers: {
        [DEVICE_TOKEN_HEADER]: validToken,
      },
      payload: {
        capability: "list_accounts",
        outcome: "match",
        requestHash: "not-a-valid-sha256-hash",
        durationMs: 10,
      },
    });

    expect(res.statusCode).toBe(400);
  });

  it("returns aggregated summaries via GET /observability/shadow-divergence/summary", async () => {
    await store.recordEvent({
      workspaceId: "workspace-1",
      capability: "list_accounts",
      outcome: "match",
      requestHash: VALID_HASH_A,
      durationMs: 10,
    });

    const res = await app.inject({
      method: "GET",
      url: "/observability/shadow-divergence/summary",
      headers: {
        [DEVICE_TOKEN_HEADER]: validToken,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.summaries).toHaveLength(1);
    expect(body.summaries[0].capability).toBe("list_accounts");
    expect(body.summaries[0].totalRuns).toBe(1);
    expect(body.summaries[0].matches).toBe(1);
  });

  it("returns paginated events via GET /observability/shadow-divergence/events", async () => {
    await store.recordEvent({
      workspaceId: "workspace-1",
      capability: "list_accounts",
      outcome: "match",
      requestHash: VALID_HASH_A,
      durationMs: 10,
    });

    const res = await app.inject({
      method: "GET",
      url: "/observability/shadow-divergence/events?limit=10",
      headers: {
        [DEVICE_TOKEN_HEADER]: validToken,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.events).toHaveLength(1);
    expect(body.events[0].capability).toBe("list_accounts");
  });
});
