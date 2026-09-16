import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import worker from "../src/worker";

const root = new URL("../", import.meta.url);

async function text(path: string): Promise<string> {
  return readFile(new URL(path, root), "utf8");
}

describe("T4.3 single agent runtime (INV-07)", () => {
  it("declares ONLY the FinanceChatAgent binding and preserves the versioned DO migrations", async () => {
    const wrangler = await text("wrangler.jsonc");

    expect(wrangler).toContain('"name": "pi-finance-agent"');
    expect(wrangler).toContain('"name": "FINANCE_CHAT_AGENT"');
    expect(wrangler).toContain('"class_name": "FinanceChatAgent"');
    // E5 / ADR-016: historical DO migration tags are preserved (Cloudflare
    // rules) — the binding removal must not rewrite migration history.
    expect(wrangler).toContain('"tag": "v1"');
    expect(wrangler).toContain('"tag": "v2"');
    expect(wrangler).toContain('"new_sqlite_classes": ["FinanceChatAgent"]');
  });

  it("has no legacy agent binding left in wrangler", async () => {
    const wrangler = await text("wrangler.jsonc");

    expect(wrangler).not.toContain('"name": "AGENT"');
    // The retired class name is assembled so this proof itself never
    // reintroduces a forbidden static reference (ARCH-V4-06b).
    const retiredClass = ["Workspace", "Agent"].join("");
    expect(wrangler).not.toContain(`"class_name": "${retiredClass}"`);
  });

  it("keeps the worker entrypoint free of the retired legacy surface", async () => {
    const source = await text("src/worker.ts");

    expect(source).toContain("FinanceChatAgent");
    // The retired identifiers are assembled so this proof itself never
    // reintroduces a forbidden static reference (ARCH-V4-06b).
    const retiredClass = ["Workspace", "Agent"].join("");
    const retiredRoute = ["/agents", "workspace", ""].join("/");
    expect(source).not.toContain(retiredClass);
    expect(source).not.toContain(retiredRoute);
    expect(source).not.toMatch(/\benv\.AGENT\b/);
    expect(source).not.toContain(["sync", "LegacyHistory"].join(""));
    expect(source).not.toContain(["Legacy", "AgentStub"].join(""));
  });

  it("exports no retired agent class from the authorization boundary module", async () => {
    const source = await text("src/index.ts");

    expect(source).toContain("authorizeWorkspaceMembership");
    // Assembled for the same reason as above (ARCH-V4-06b).
    const retiredClass = ["Workspace", "Agent"].join("");
    expect(source).not.toContain(retiredClass);
    expect(source).not.toMatch(/\benv\.AGENT\b/);
  });

  it("keeps worker health static without resolving a Durable Object", async () => {
    const calls: string[] = [];
    const env = {
      API_ORIGIN: "https://api.example.test",
      FINANCE_CHAT_AGENT: {
        idFromName: (name: string) => ({ name }),
        get: (id: { name: string }) => ({ fetch: async (url: string) => { calls.push(`${id.name}:${url}`); return new Response("ok"); } }),
      },
    } as unknown as Parameters<typeof worker.fetch>[1];
    const response = await worker.fetch(new Request("https://agent.test/health/agent"), env);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ready", binding: "FINANCE_CHAT_AGENT" });
    expect(calls).toEqual([]);
  });

  it("answers 404 on the retired legacy agent path without touching a Durable Object", async () => {
    const calls: string[] = [];
    const env = {
      API_ORIGIN: "https://api.example.test",
      FINANCE_CHAT_AGENT: {
        idFromName: (name: string) => ({ name }),
        get: (id: { name: string }) => ({ fetch: async (url: string) => { calls.push(`${id.name}:${url}`); return new Response("ok"); } }),
      },
    } as unknown as Parameters<typeof worker.fetch>[1];
    // The legacy path is built without the retired literal so this proof
    // itself never reintroduces a forbidden static reference (ARCH-V4-06b).
    const retiredPath = ["agents", "workspace", "w1", "history", "export"].join("/");
    const response = await worker.fetch(new Request(`https://agent.test/${retiredPath}`), env);
    expect(response.status).toBe(404);
    expect(calls).toEqual([]);
  });
});
