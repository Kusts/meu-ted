import { describe, it, expect, vi, afterEach } from "vitest";
import worker from "../src/worker.js";
import { createAgentConnectionToken } from "../../api/src/auth/agent-connection-token.js";
import type { LegacyFullExport } from "../src/migration/legacy-history.js";

type WorkerEnv = Parameters<typeof worker.fetch>[1];

describe("Gateway history_migration_failed/idempotency (RED for live block)", () => {
  afterEach(() => vi.restoreAllMocks());

  const SECRET = "secret-for-testing-purposes-at-least-32-chars!";
  const WORKSPACE_ID = "00000000-0000-4000-8000-000000000001";
  const GENUINE_USER = "user-authenticated-uuid";

  const emptyExport: LegacyFullExport = {
    version: 5,
    workspaceId: WORKSPACE_ID,
    turns: [],
    messages: [],
    hasInFlightTurns: false,
  };

  const pendingExport: LegacyFullExport = {
    version: 5,
    workspaceId: WORKSPACE_ID,
    turns: [{ id: "turn-pending", actor_id: GENUINE_USER, status: "queued", attempts: 0, tokens_used: 10 }],
    messages: [
      {
        id: "msg-pending",
        actor_id: GENUINE_USER,
        role: "user",
        content_json: JSON.stringify("hello pending"),
        created_at: new Date().toISOString(),
      },
    ],
    hasInFlightTurns: true,
  };

  it("RED: GET /rpc/history should NOT be blocked by migration_blocked_turns_in_flight (history is read-only, must remain available)", async () => {
    const token = await createAgentConnectionToken({ sub: GENUINE_USER, workspace: WORKSPACE_ID, role: "owner" }, SECRET);
    const legacyExportSpy = vi.fn(async () => pendingExport);
    const financeImportSpy = vi.fn(async () => ({
      success: false,
      importedCount: 0,
      skipped: false,
      reason: "migration_blocked_turns_in_flight: workspace has active turns in queued/running state",
    }));
    const financeFetchSpy = vi.fn(async () => new Response(JSON.stringify({ items: [], total: 0 }), { status: 200 }));

    const env: WorkerEnv = {
      AGENT: {
        idFromName: vi.fn((n: string) => ({ name: n }) as unknown as DurableObjectId),
        get: vi.fn(() => ({ exportFullWorkspaceHistory: legacyExportSpy, fetch: vi.fn() } as unknown as never)),
      },
      FINANCE_CHAT_AGENT: {
        idFromName: vi.fn((n: string) => ({ name: n }) as unknown as DurableObjectId),
        get: vi.fn(() => ({ importLegacyHistory: financeImportSpy, fetch: financeFetchSpy } as unknown as never)),
      },
      API_ORIGIN: "https://api.test.local",
      AGENT_CONNECTION_TOKEN_SECRET: SECRET,
    };

    const req = new Request(`https://agent.test.local/agents/finance-chat-agent/${WORKSPACE_ID}/rpc/history`, {
      method: "GET",
      headers: { "x-agent-connection-token": token, origin: "https://pi-finance-pwa.walissonead.workers.dev" },
    });

    const res = await worker.fetch(req, env);
    // After fix, history should be allowed (200) even when migration is pending; before fix it was 409
    expect(res.status).toBe(200);
    expect(financeFetchSpy).toHaveBeenCalled();
  });

  it("POST /rpc/chat SHOULD still be blocked with 409 when migration has in-flight turns", async () => {
    const token = await createAgentConnectionToken({ sub: GENUINE_USER, workspace: WORKSPACE_ID, role: "owner" }, SECRET);
    const legacyExportSpy = vi.fn(async () => pendingExport);
    const financeImportSpy = vi.fn(async () => ({
      success: false,
      importedCount: 0,
      skipped: false,
      reason: "migration_blocked_turns_in_flight: workspace has active turns in queued/running state",
    }));
    const financeFetchSpy = vi.fn(async () => new Response(JSON.stringify({ status: "completed" }), { status: 200 }));

    const env: WorkerEnv = {
      AGENT: {
        idFromName: vi.fn((n: string) => ({ name: n }) as unknown as DurableObjectId),
        get: vi.fn(() => ({ exportFullWorkspaceHistory: legacyExportSpy, fetch: vi.fn() } as unknown as never)),
      },
      FINANCE_CHAT_AGENT: {
        idFromName: vi.fn((n: string) => ({ name: n }) as unknown as DurableObjectId),
        get: vi.fn(() => ({ importLegacyHistory: financeImportSpy, fetch: financeFetchSpy } as unknown as never)),
      },
      API_ORIGIN: "https://api.test.local",
      AGENT_CONNECTION_TOKEN_SECRET: SECRET,
    };

    const req = new Request(`https://agent.test.local/agents/finance-chat-agent/${WORKSPACE_ID}/rpc/chat`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-agent-connection-token": token, origin: "https://pi-finance-pwa.walissonead.workers.dev" },
      body: JSON.stringify({ text: "hello" }),
    });

    const res = await worker.fetch(req, env);
    expect(res.status).toBe(409);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("agent.history_migration_pending");
    expect(financeFetchSpy).not.toHaveBeenCalled();
  });

  it("RED: empty legacy export should NOT trigger importLegacyHistory (idempotent, no-op)", async () => {
    const token = await createAgentConnectionToken({ sub: GENUINE_USER, workspace: WORKSPACE_ID, role: "owner" }, SECRET);
    const legacyExportSpy = vi.fn(async () => emptyExport);
    const financeImportSpy = vi.fn(async () => ({ success: true, importedCount: 0, skipped: true, migrationHash: "empty-hash" }));
    const financeFetchSpy = vi.fn(async () => new Response(JSON.stringify({ items: [], total: 0 }), { status: 200 }));

    const env: WorkerEnv = {
      AGENT: {
        idFromName: vi.fn((n: string) => ({ name: n }) as unknown as DurableObjectId),
        get: vi.fn(() => ({ exportFullWorkspaceHistory: legacyExportSpy, fetch: vi.fn() } as unknown as never)),
      },
      FINANCE_CHAT_AGENT: {
        idFromName: vi.fn((n: string) => ({ name: n }) as unknown as DurableObjectId),
        get: vi.fn(() => ({ importLegacyHistory: financeImportSpy, fetch: financeFetchSpy } as unknown as never)),
      },
      API_ORIGIN: "https://api.test.local",
      AGENT_CONNECTION_TOKEN_SECRET: SECRET,
    };

    const req = new Request(`https://agent.test.local/agents/finance-chat-agent/${WORKSPACE_ID}/rpc/history`, {
      method: "GET",
      headers: { "x-agent-connection-token": token, origin: "https://pi-finance-pwa.walissonead.workers.dev" },
    });

    const res = await worker.fetch(req, env);
    expect(res.status).toBe(200);
    expect(legacyExportSpy).toHaveBeenCalled();
    // After fix, empty export should skip import entirely (idempotent)
    expect(financeImportSpy).not.toHaveBeenCalled();
    expect(financeFetchSpy).toHaveBeenCalled();
  });
});
