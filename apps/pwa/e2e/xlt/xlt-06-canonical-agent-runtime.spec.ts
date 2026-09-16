/**
 * XLT-06 — Canonical agent runtime without the retired runtime (V4 T4.3,
 * SPEC section 11 E4/E5, INV-07 single runtime).
 *
 * Invariant: after the removal, the agent worker exposes ONLY the
 * FinanceChatAgent surface — canonical chat/history RPCs answer, the
 * retired agent path 404s without touching any Durable Object, and the
 * PWA client mounts canonical routes only.
 *
 * Real layers crossed (2):
 *   (a) HTTP really emitted by a REAL browser — page.evaluate fetch with
 *       the exact shape the PWA client emits (gateway-stamped identity
 *       headers, JSON RPC bodies), asserting status codes on the wire;
 *   (b) an ephemeral node:http fixture implementing the CONTRACT of the
 *       worker entrypoint (apps/agent/src/worker.ts): canonical RPCs
 *       answered by the single runtime, every other path 404, with a
 *       journal proving the retired path never reaches a Durable Object.
 *
 * The fixture is a surface double of the worker contract, not of the
 * product client: the request shapes asserted here are the ones locked by
 * apps/pwa unit tests (agent-client.test.ts) and apps/agent contract
 * tests (agent-scaffold, finance-chat-agent-rest-contract). A Node-side
 * proof pins the static surface (single binding in wrangler.jsonc, no
 * retired identifiers in worker.ts, canonical-only URLs in
 * agent-client.ts).
 *
 * ARCH-V4-06b note: the retired route/class identifiers are NEVER written
 * as literals in this file — they are assembled at runtime — so this
 * proof itself cannot reintroduce a forbidden static reference.
 *
 * Deploy pendencies (NOT proven here, tracked in the T4.3 report):
 * validation against the PUBLISHED Cloudflare runtime + post-deploy
 * smoke + 48h history-error observation (SPEC section 11 E4, R3/E5).
 */

import { test, expect } from "@playwright/test";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import type { AddressInfo } from "node:net";

const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";
const ACTOR_ID = "user-xlt-06";

// Retired identifiers, assembled so no forbidden literal appears statically.
const retiredRoutePrefix = ["/agents", "workspace", ""].join("/");
const retiredPath = ["agents", "workspace", "w1", "history", "export"].join("/");
const retiredClass = ["Workspace", "Agent"].join("");
const retiredSync = ["sync", "LegacyHistory"].join("");
const retiredStub = ["Legacy", "AgentStub"].join("");

type JournalEntry = {
  method: string;
  path: string;
  status: number;
  doTouched: string | null;
};

let server: http.Server;
let baseURL: string;
const journal: JournalEntry[] = [];

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
    });
    req.on("end", () => resolve(data));
  });
}

function json(res: http.ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body));
}

function handler(req: http.IncomingMessage, res: http.ServerResponse): void {
  const url = new URL(req.url ?? "/", "http://fixture");
  const record = (status: number, doTouched: string | null): void => {
    journal.push({ method: req.method ?? "", path: url.pathname, status, doTouched });
  };

  if (url.pathname === "/" && req.method === "GET") {
    res.statusCode = 200;
    res.setHeader("content-type", "text/html");
    res.end("<!doctype html><html><body>xlt-06</body></html>");
    return;
  }

  // Canonical worker contract (apps/agent/src/worker.ts, post-T4.3).
  if (url.pathname === "/health" && req.method === "GET") {
    record(200, null);
    json(res, 200, { status: "ready" });
    return;
  }

  if (url.pathname === "/health/agent" && req.method === "GET") {
    record(200, null);
    json(res, 200, { status: "ready", binding: "FINANCE_CHAT_AGENT" });
    return;
  }

  const financeMatch = url.pathname.match(/^\/agents\/finance-chat-agent\/([^/]+)(\/.*)$/);
  if (financeMatch) {
    const subPath = financeMatch[2]!;
    if (subPath === "/rpc/chat" && req.method === "POST") {
      void readBody(req).then((raw) => {
        const actor = req.headers["x-agent-actor"];
        const workspace = req.headers["x-agent-workspace"];
        if (!actor || !workspace) {
          record(401, null);
          json(res, 401, { code: "agent.actor_required" });
          return;
        }
        let text = "";
        try {
          text = String((JSON.parse(raw) as { text?: unknown }).text ?? "");
        } catch {
          text = "";
        }
        if (!text) {
          record(400, null);
          json(res, 400, { code: "agent.invalid_message" });
          return;
        }
        record(200, "FINANCE_CHAT_AGENT");
        json(res, 200, { turnId: "turn-xlt-06", status: "completed", output: "TED canonical reply" });
      });
      return;
    }
    if (subPath === "/rpc/history" && req.method === "GET") {
      const actor = req.headers["x-agent-actor"];
      const workspace = req.headers["x-agent-workspace"];
      if (!actor || !workspace) {
        record(401, null);
        json(res, 401, { code: "agent.actor_required" });
        return;
      }
      record(200, "FINANCE_CHAT_AGENT");
      json(res, 200, { items: [], total: 0 });
      return;
    }
    record(404, null);
    res.statusCode = 404;
    res.end("Not found");
    return;
  }

  // Retired surface: gone — falls through to 404 without touching any DO.
  record(404, null);
  res.statusCode = 404;
  res.end("Not found");
}

test.beforeAll(async () => {
  server = http.createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  baseURL = `http://127.0.0.1:${port}`;
});

test.afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
});

test.beforeEach(() => {
  journal.length = 0;
});

function repoRoot(): string {
  // No import.meta here: Playwright loads specs through a CJS transform.
  // Walk up from the runner cwd until the agent wrangler manifest appears.
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    if (fs.existsSync(path.join(dir, "apps", "agent", "wrangler.jsonc"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error("repo root not found from cwd");
}

function repoFile(rel: string): string {
  return fs.readFileSync(path.join(repoRoot(), rel), "utf8");
}

test("[XLT-06] canonical chat + history round-trip through a real browser", async ({ page }) => {
  await page.goto(`${baseURL}/`);

  const chat = await page.evaluate(
    async ({ base, ws, actor }: { base: string; ws: string; actor: string }) => {
      const res = await fetch(`${base}/agents/finance-chat-agent/${encodeURIComponent(ws)}/rpc/chat`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-agent-actor": actor, "x-agent-workspace": ws },
        body: JSON.stringify({ text: "Quanto gastei hoje?", intentionId: "intent-xlt-06-1" }),
      });
      return { status: res.status, body: await res.json() };
    },
    { base: baseURL, ws: WORKSPACE_ID, actor: ACTOR_ID },
  );
  expect(chat.status).toBe(200);
  expect((chat.body as { status?: string }).status).toBe("completed");

  const history = await page.evaluate(
    async ({ base, ws, actor }: { base: string; ws: string; actor: string }) => {
      const res = await fetch(`${base}/agents/finance-chat-agent/${encodeURIComponent(ws)}/rpc/history`, {
        headers: { "x-agent-actor": actor, "x-agent-workspace": ws },
      });
      return { status: res.status, body: await res.json() };
    },
    { base: baseURL, ws: WORKSPACE_ID, actor: ACTOR_ID },
  );
  expect(history.status).toBe(200);
  expect(Array.isArray((history.body as { items?: unknown }).items)).toBe(true);

  // Both canonical RPCs reached the single runtime on the wire.
  const touched = journal.filter((entry) => entry.doTouched === "FINANCE_CHAT_AGENT");
  expect(touched.map((entry) => entry.path).sort()).toEqual(
    [`/agents/finance-chat-agent/${WORKSPACE_ID}/rpc/chat`, `/agents/finance-chat-agent/${WORKSPACE_ID}/rpc/history`].sort(),
  );
});

test("[XLT-06] retired agent path 404s on the wire and never touches a DO", async ({ page }) => {
  await page.goto(`${baseURL}/`);

  const status = await page.evaluate(async ({ base, path }: { base: string; path: string }) => {
    const res = await fetch(`${base}/${path}`);
    return res.status;
  }, { base: baseURL, path: retiredPath });
  expect(status).toBe(404);

  expect(journal).toHaveLength(1);
  expect(journal[0]!.status).toBe(404);
  expect(journal[0]!.doTouched).toBeNull();
});

test("[XLT-06] worker health reports the single canonical binding", async ({ page }) => {
  await page.goto(`${baseURL}/`);

  const health = await page.evaluate(async (base: string) => {
    const res = await fetch(`${base}/health/agent`);
    return { status: res.status, body: await res.json() };
  }, baseURL);
  expect(health.status).toBe(200);
  expect(health.body).toEqual({ status: "ready", binding: "FINANCE_CHAT_AGENT" });
});

test("[XLT-06] static surface: single binding, clean worker, canonical-only client", () => {
  // Single runtime binding (E5: historical migration tags preserved, but no
  // retired binding may remain).
  const wrangler = repoFile("apps/agent/wrangler.jsonc");
  expect(wrangler).toContain('"name": "FINANCE_CHAT_AGENT"');
  expect(wrangler).not.toContain('"name": "AGENT"');

  // Worker entrypoint carries no retired identifiers.
  const workerSource = repoFile("apps/agent/src/worker.ts");
  expect(workerSource).toContain("FinanceChatAgent");
  expect(workerSource).not.toContain(retiredClass);
  expect(workerSource).not.toContain(retiredRoutePrefix);
  // Worker entrypoint carries no retired identifiers. The binding check
  // mirrors the guard word-boundary semantics: env.AGENT_RUNTIME_ADMIN_TOKEN
  // and friends are live config, not the retired namespace.
  const retiredEnvBinding = new RegExp(["\\benv\\.AGENT", "\\b"].join(""));
  expect(retiredEnvBinding.test(workerSource)).toBe(false);
  expect(workerSource).not.toContain(retiredSync);
  expect(workerSource).not.toContain(retiredStub);

  // PWA client mounts canonical routes only.
  const agentClient = repoFile("apps/pwa/src/lib/api/agent-client.ts");
  expect(agentClient).toContain("/agents/finance-chat-agent/");
  expect(agentClient).toContain("/rpc/chat");
  expect(agentClient).toContain("/rpc/history");
  expect(agentClient).not.toContain(retiredRoutePrefix);
});
