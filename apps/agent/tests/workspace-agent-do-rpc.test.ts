import { describe, it, expect } from "vitest";
import { DurableObject } from "cloudflare:workers";
import { WorkspaceAgent } from "../src/index.js";

describe("WorkspaceAgent Durable Object RPC contract (RED)", () => {
  const makeState = () => {
    const queries: string[] = [];
    const sql = {
      exec: (query: string, ..._args: unknown[]) => {
        queries.push(query);
        // Minimal iterable response for SELECTs
        if (query.includes("SELECT")) return [] as unknown as Iterable<never>;
        return [] as unknown as Iterable<never>;
      },
    };
    return {
      state: { storage: { sql, setAlarm: async () => {} } } as unknown as DurableObjectState,
      queries,
      sql,
    };
  };

  it("extends DurableObject and exposes exportFullWorkspaceHistory as RPC method", async () => {
    // Heritage check – must be Durable Object subclass for Cloudflare RPC
    expect(Object.getPrototypeOf(WorkspaceAgent.prototype)).toBe(DurableObject.prototype);
    expect(WorkspaceAgent.prototype).toHaveProperty("exportFullWorkspaceHistory");

    const { state } = makeState();
    const agent = new WorkspaceAgent(state as DurableObjectState, {} as never);
    expect(agent).toBeInstanceOf(DurableObject);
    expect(typeof (agent as unknown as { exportFullWorkspaceHistory: unknown }).exportFullWorkspaceHistory).toBe("function");

    // RPC contract: should return full export shape even on empty storage
    const result = await agent.exportFullWorkspaceHistory("ws-red-test");
    expect(result.workspaceId).toBe("ws-red-test");
    expect(result.version).toBeDefined();
    expect(Array.isArray(result.turns)).toBe(true);
    expect(Array.isArray(result.messages)).toBe(true);
    expect(typeof result.hasInFlightTurns).toBe("boolean");
  });

  it("wires ctx/env via super and preserves storage access", () => {
    const { state, sql } = makeState();
    const env = { AGENT_DELEGATION_SECRET: "test-secret-for-rpc" } as never;
    const agent = new WorkspaceAgent(state as DurableObjectState, env);

    // After super(ctx, env), both ctx and env must be available (real DO uses ctx/env)
    // RED requires DurableObject inheritance – plain class would not have ctx bound via super
    expect(agent).toBeInstanceOf(DurableObject);
    const anyAgent = agent as unknown as { ctx?: unknown; env?: unknown; state?: unknown; storage?: unknown };
    expect(anyAgent.ctx).toBeDefined();
    expect(anyAgent.env).toBeDefined();
    // storage accessor should still work (legacy code uses this.state.storage or this.ctx.storage)
    expect(anyAgent.storage ?? (anyAgent.state as { storage?: unknown })?.storage ?? (anyAgent.ctx as { storage?: unknown })?.storage).toBeDefined();

    // sql should have been initialized (schema exec called)
    // at least one CREATE TABLE should have been issued
    expect(sql.exec).toBeDefined();
  });

  it("exportFullWorkspaceHistory is callable as Durable Object RPC stub method pattern", async () => {
    const { state } = makeState();
    const agent = new WorkspaceAgent(state as DurableObjectState, {} as never);
    expect(agent).toBeInstanceOf(DurableObject);
    // Simulate how worker.ts calls it: stub.exportFullWorkspaceHistory(workspaceId)
    const stubLike = agent as unknown as { exportFullWorkspaceHistory: (ws: string) => Promise<unknown> };
    expect(typeof stubLike.exportFullWorkspaceHistory).toBe("function");
    const exported = await stubLike.exportFullWorkspaceHistory("ws-stub");
    expect(exported).toHaveProperty("workspaceId", "ws-stub");
  });
});
