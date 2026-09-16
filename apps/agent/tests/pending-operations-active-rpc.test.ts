/**
 * T5.3 (H-14, SPEC §22) — active pending-operations visibility.
 *
 * The PWA Home/Aprovações surfaces may REFLECT pending approvals but never
 * decide them. The authoritative listing lives server-side: the Agent rpc
 * delegates to the API (GET /pending-operations/v2/active) with a
 * READ-ONLY delegated token and relays ONLY the lean projection — never
 * attestation material, never raw normalizedArgs.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import type { UIMessage } from "agents/ai-chat-agent";
import { FinanceChatAgent } from "../src/finance-chat-agent.js";
import worker from "../src/worker.js";
import { createAgentConnectionToken } from "../../api/src/auth/agent-connection-token.js";
import { decodeDelegatedTurnToken } from "../src/delegated-token.js";

type WorkerEnv = Parameters<typeof worker.fetch>[1];

const CONNECTION_SECRET = "test-connection-secret-32-chars-minimum!!";
const DELEGATION_SECRET = "test-delegation-secret-32-chars-min!!";
const SERVICE_TOKEN = "test-service-token-32-chars-minimum!!";
const WS = "11111111-1111-4111-8111-111111111111";
const ACTOR = "user-real";
const DEVICE = "device-binding-1";
const API_ORIGIN = "https://api.example.test";

const createTestAgent = () => {
  const persisted: UIMessage[] = [];
  const agent = Object.create(FinanceChatAgent.prototype) as FinanceChatAgent & {
    messages: UIMessage[];
    persistMessages: (msgs: UIMessage[]) => Promise<void>;
  };
  agent.messages = persisted;
  agent.persistMessages = vi.fn(async (msgs: UIMessage[]) => {
    persisted.push(...msgs);
  });
  Object.defineProperty(agent, "state", {
    value: { storage: {} },
    writable: true,
    configurable: true,
  });
  Object.defineProperty(agent, "env", {
    value: {
      API_ORIGIN,
      AGENT_DELEGATION_SECRET: DELEGATION_SECRET,
    },
    writable: true,
    configurable: true,
  });
  return { agent, persisted };
};

const identityHeaders = (): Record<string, string> => ({
  "x-agent-actor": ACTOR,
  "x-agent-workspace": WS,
  "x-agent-device": DEVICE,
  "x-agent-role": "owner",
});

const leanItem = (overrides: Record<string, unknown> = {}) => ({
  id: "op-1",
  status: "proposed",
  tool: "transactions.expense.create",
  createdAt: "2026-09-15T10:00:00.000Z",
  expiresAt: "2026-09-15T15:00:00.000Z",
  amountCents: 8500,
  description: "Mercado",
  date: "2026-09-15",
  accountId: "acc-1",
  categoryId: "cat-1",
  ...overrides,
});

const LEAN_KEYS = [
  "accountId",
  "amountCents",
  "categoryId",
  "createdAt",
  "date",
  "description",
  "expiresAt",
  "id",
  "status",
  "tool",
] as const;

describe("T5.3 — GET /rpc/pending-operations/active (Agent rpc, lean & read-only)", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.restoreAllMocks();
  });

  it("delegates to the authoritative API with a read-only delegated token and relays the lean projection", async () => {
    const { agent } = createTestAgent();
    const seen: Array<{ url: string; method?: string; headers: Record<string, string> }> = [];
    globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
      const u = String(url);
      if (u.includes("/pending-operations/v2/active")) {
        const headers: Record<string, string> = {};
        new Headers(init?.headers).forEach((value, key) => {
          headers[key] = value;
        });
        seen.push({
          url: u,
          method: init?.method,
          headers,
        });
        return Response.json({ items: [leanItem()], total: 1 }, { status: 200 });
      }
      return new Response("not found", { status: 404 });
    }) as unknown as typeof fetch;

    const res = await agent.fetch(
      new Request(`https://agent.test.local/rpc/pending-operations/active`, {
        method: "GET",
        headers: identityHeaders(),
      }),
    );
    expect(res.status).toBe(200);

    // Exactly ONE authoritative call, scoped to the DO-verified identity.
    expect(seen).toHaveLength(1);
    expect(seen[0]!.url).toBe(`${API_ORIGIN}/pending-operations/v2/active`);
    expect(seen[0]!.method).toBe("GET");
    expect(seen[0]!.headers["x-workspace-id"]).toBe(WS);
    expect(seen[0]!.headers["x-actor-id"]).toBe(ACTOR);
    expect(seen[0]!.headers["x-device-id"]).toBe(DEVICE);

    // The delegated credential carries READ capability ONLY — a listing can
    // never confirm/execute/cancel.
    const bearer = seen[0]!.headers["authorization"] ?? "";
    expect(bearer.startsWith("Bearer ")).toBe(true);
    const claims = await decodeDelegatedTurnToken(bearer.slice(7), DELEGATION_SECRET);
    expect(claims.capabilities).toEqual(["financial.approval.read"]);
    expect(claims.workspace).toBe(WS);
    expect(claims.sub).toBe(ACTOR);
    expect(claims.deviceId).toBe(DEVICE);

    const body = (await res.json()) as { items: Array<Record<string, unknown>>; total: number };
    expect(body.total).toBe(1);
    expect(body.items).toEqual([leanItem()]);
  });

  it("never relays attestation material or raw normalizedArgs, even if the API echoed them", async () => {
    const { agent } = createTestAgent();
    globalThis.fetch = (async (url: unknown) => {
      if (String(url).includes("/pending-operations/v2/active")) {
        return Response.json(
          {
            items: [
              leanItem({
                attestation: "a".repeat(64),
                normalizedArgs: { amountCents: 8500, accountId: "acc-1" },
                attestationClaims: { scope: "financial" },
              }),
              // Invalid shape is dropped wholesale, never partially relayed.
              { id: "op-broken" },
              leanItem({ id: "op-2", description: "Farmácia" }),
            ],
            total: 3,
          },
          { status: 200 },
        );
      }
      return new Response("not found", { status: 404 });
    }) as unknown as typeof fetch;

    const res = await agent.fetch(
      new Request(`https://agent.test.local/rpc/pending-operations/active`, {
        method: "GET",
        headers: identityHeaders(),
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: Array<Record<string, unknown>>; total: number };
    expect(body.items).toHaveLength(2);
    for (const item of body.items) {
      expect(item).not.toHaveProperty("attestation");
      expect(item).not.toHaveProperty("attestationClaims");
      expect(item).not.toHaveProperty("normalizedArgs");
      // FIX-P1: the allowlist is the 10 lean keys plus the optional
      // canonical presentation — nothing else may cross to the browser.
      const keys = Object.keys(item).sort();
      expect(keys.every((key) => [...LEAN_KEYS, "presentation"].includes(key))).toBe(true);
      expect(LEAN_KEYS.every((key) => keys.includes(key))).toBe(true);
    }
  });

  it("relays the canonical server-derived presentation and drops a poisoned one", async () => {
    const { agent } = createTestAgent();
    const presentation = {
      id: "op-1",
      status: "proposed",
      tool: "transactions.expense.create",
      title: "Confirmar despesa",
      amountCents: 8500,
      description: "Mercado",
      date: "2026-09-15",
      expiresAt: "2026-09-15T15:00:00.000Z",
      warnings: [],
    };
    globalThis.fetch = (async (url: unknown) => {
      if (String(url).includes("/pending-operations/v2/active")) {
        return Response.json(
          {
            items: [
              leanItem({ presentation }),
              leanItem({ id: "op-2", presentation: { ...presentation, id: "op-2", attestation: "a".repeat(64) } }),
            ],
            total: 2,
          },
          { status: 200 },
        );
      }
      return new Response("not found", { status: 404 });
    }) as unknown as typeof fetch;

    const res = await agent.fetch(
      new Request(`https://agent.test.local/rpc/pending-operations/active`, {
        method: "GET",
        headers: identityHeaders(),
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: Array<Record<string, unknown>>; total: number };
    expect(body.items).toHaveLength(2);
    // Valid presentation relays intact (display-only, no authority material).
    expect(body.items[0]!.presentation).toMatchObject({ title: "Confirmar despesa", amountCents: 8500 });
    expect(JSON.stringify(body.items[0])).not.toContain("attestation");
    // Poisoned presentation is dropped; the lean record still relays.
    expect(body.items[1]).not.toHaveProperty("presentation");
    expect(body.items[1]!.id).toBe("op-2");
  });

  it("maps an API failure to an honest operational error (502, pt-BR)", async () => {
    const { agent } = createTestAgent();
    globalThis.fetch = (async () => new Response("boom", { status: 503 })) as unknown as typeof fetch;

    const res = await agent.fetch(
      new Request(`https://agent.test.local/rpc/pending-operations/active`, {
        method: "GET",
        headers: identityHeaders(),
      }),
    );
    expect(res.status).toBe(502);
    const body = (await res.json()) as { code?: string; message?: string };
    expect(body.code).toBe("agent.pending_list_unavailable");
    expect(body.message).toBe("Não foi possível carregar as aprovações agora.");
  });

  it("requires the gateway-stamped identity (401, no API call, no delegated token)", async () => {
    const { agent } = createTestAgent();
    const fetchSpy = vi.fn(async () => new Response("{}", { status: 200 }));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const res = await agent.fetch(
      new Request(`https://agent.test.local/rpc/pending-operations/active`, { method: "GET" }),
    );
    expect(res.status).toBe(401);
    expect(((await res.json()) as { code?: string }).code).toBe("agent.approval_context_required");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("T5.3 — worker gateway routes the active listing", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.restoreAllMocks();
  });

  const mint = (nowMs: number) =>
    createAgentConnectionToken({ sub: ACTOR, workspace: WS, role: "owner", deviceId: DEVICE }, CONNECTION_SECRET, nowMs);

  const workerEnv = (financeFetch: (request: Request) => Promise<Response>) =>
    ({
      API_ORIGIN: "https://api.example.test",
      AGENT_CONNECTION_TOKEN_SECRET: CONNECTION_SECRET,
      AGENT_AUTH_SERVICE_TOKEN: SERVICE_TOKEN,
      FINANCE_CHAT_AGENT: {
        idFromName: vi.fn((n: string) => ({ n })),
        get: vi.fn(() => ({ fetch: financeFetch })),
      },
    }) as unknown as WorkerEnv;

  const workerFetchMock = () =>
    (async (url: unknown) => {
      const u = String(url);
      if (u.includes("/internal/workspace-alias/")) {
        return new Response(JSON.stringify({ canonicalHouseholdId: WS }), { status: 200 });
      }
      if (u.includes("/internal/agent/consume-token")) {
        return new Response(JSON.stringify({ ok: true, consumed: true }), { status: 200 });
      }
      return new Response("not found", { status: 404 });
    }) as unknown as typeof fetch;

  it("forwards GET /rpc/pending-operations/active to the DO with stamped identity, without legacy history sync", async () => {
    globalThis.fetch = workerFetchMock();
    const financeFetch = vi.fn<(request: Request) => Promise<Response>>(async () =>
      Response.json({ items: [leanItem()], total: 1 }, { status: 200 }),
    );
    const env = workerEnv(financeFetch);
    const token = await mint(Date.now());

    const res = await worker.fetch(
      new Request(`https://worker.test/agents/finance-chat-agent/${WS}/rpc/pending-operations/active`, {
        method: "GET",
        headers: { "x-agent-connection-token": token },
      }),
      env,
    );

    expect(res.status).toBe(200);
    expect(((await res.json()) as { total?: number }).total).toBe(1);
    expect(financeFetch).toHaveBeenCalledOnce();
    const forwarded = financeFetch.mock.calls[0]![0];
    expect(new URL(forwarded.url).pathname).toBe("/rpc/pending-operations/active");
    expect(forwarded.headers.get("x-agent-actor")).toBe(ACTOR);
    expect(forwarded.headers.get("x-agent-workspace")).toBe(WS);
    expect(forwarded.headers.get("x-agent-device")).toBe(DEVICE);
    // Listing reads the authoritative API — T4.3 removed the retired
    // legacy history migration, so this hot path has no legacy dependency
    // by construction (single runtime, INV-07).
  });

  it("rejects the listing without a connection token (unauthorized path, DO untouched)", async () => {
    globalThis.fetch = workerFetchMock();
    const financeFetch = vi.fn<(request: Request) => Promise<Response>>(async () => new Response("do", { status: 200 }));
    const env = workerEnv(financeFetch);

    const res = await worker.fetch(
      new Request(`https://worker.test/agents/finance-chat-agent/${WS}/rpc/pending-operations/active`, {
        method: "GET",
      }),
      env,
    );

    // No credential → the gateway denies before any DO access. With neither
    // a connection token nor a session cookie the cookie fallback reports
    // membership_unavailable (503); the invariant under test is: never the
    // DO, never a listing.
    expect(res.status).toBe(503);
    expect(((await res.json()) as { code?: string }).code).toBe("agent.membership_unavailable");
    expect(financeFetch).not.toHaveBeenCalled();
  });
});
