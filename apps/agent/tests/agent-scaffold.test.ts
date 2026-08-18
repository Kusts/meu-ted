import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import worker, { WorkspaceAgent } from "../src/index";

const root = new URL("../", import.meta.url);

async function text(path: string): Promise<string> {
  return readFile(new URL(path, root), "utf8");
}

describe("G5.1.1 workspace Agent scaffold", () => {
  it("declares the WorkspaceAgent SQLite binding and versioned migration", async () => {
    const wrangler = await text("wrangler.jsonc");
    const migration = await text("migrations/0001_workspace_agent.sql");
    const intentionMigration = await text("migrations/0002_stable_intentions.sql");

    expect(wrangler).toContain('"name": "pi-finance-agent"');
    expect(wrangler).toContain('"name": "AGENT"');
    expect(wrangler).toContain('"class_name": "WorkspaceAgent"');
    expect(wrangler).toContain('"tag": "v1"');
    expect(wrangler).toContain('"new_sqlite_classes": ["WorkspaceAgent"]');
    expect(migration).toMatch(/CREATE TABLE IF NOT EXISTS messages/i);
    expect(migration).toMatch(/CREATE TABLE IF NOT EXISTS agent_state/i);
    expect(migration).toMatch(/CREATE INDEX IF NOT EXISTS/i);
    expect(intentionMigration).toMatch(/ADD COLUMN intention_id/i);
  });

  it("executes schema v5 once and exposes a ready Durable Object health path", async () => {
    const queries: string[] = [];
    const sql = { exec: (query: string) => { queries.push(query); return []; } };
    const agent = new WorkspaceAgent({ storage: { sql } });
    const health = await agent.fetch(new Request("https://agent.test/health"));

    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({ status: "ready", schemaVersion: 5 });
    expect(queries.some((query) => query.includes("CREATE TABLE IF NOT EXISTS messages"))).toBe(true);
    expect(queries.some((query) => query.includes("ADD COLUMN intention_id"))).toBe(true);
    expect(queries.some((query) => query.includes("CREATE TABLE IF NOT EXISTS daily_token_usage"))).toBe(true);
    expect(queries.some((query) => query.includes("CREATE TABLE IF NOT EXISTS agent_rate_limits"))).toBe(true);
    expect(queries.some((query) => query.includes("CREATE TABLE IF NOT EXISTS transcript_redaction"))).toBe(true);
    expect(queries.some((query) => query.includes("CREATE TABLE IF NOT EXISTS access_log"))).toBe(true);
    expect(queries.some((query) => query.includes("INSERT INTO _agent_schema_migrations"))).toBe(true);
  });

  it("keeps worker health static without resolving a Durable Object", async () => {
    const calls: string[] = [];
    const env = {
      API_ORIGIN: "https://api.example.test",
      AGENT: {
        idFromName: (name: string) => ({ name }),
        get: (id: { name: string }) => ({ fetch: async (url: string) => { calls.push(`${id.name}:${url}`); return new Response("ok"); } }),
      },
    } as unknown as Env;
    const response = await worker.fetch(new Request("https://agent.test/health/agent"), env);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ready", binding: "AGENT" });
    expect(calls).toEqual([]);
  });

  it("exports the Worker entrypoint and the bound Durable Object class", async () => {
    const source = await text("src/index.ts");
    expect(source).toContain("export class WorkspaceAgent");
    expect(source).toContain("export default");
    expect(source).toContain("env.AGENT");
  });
});
