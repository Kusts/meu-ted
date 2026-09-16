/**
 * XLT-02 — Cookie-first auth (V4 T2.2 B1/B3, SPEC §8, ADR-015 Opção C).
 *
 * Invariante: login → cookie HttpOnly de sessão → proxy same-origin →
 * API autenticada, SEM bearer novo em localStorage.
 *
 * Camadas reais atravessadas (2):
 *   (a) cookie jar REAL do browser (contexto Playwright) — o login recebe
 *       `Set-Cookie: HttpOnly` e o browser o reenvia via `credentials:
 *       "include"`, sem JS legível (`document.cookie` não o expõe);
 *   (b) HTTP realmente emitido — fixture node:http efêmera implementando o
 *       contrato do proxy (`Set-Cookie` passthrough no login; cookie
 *       obrigatório na rota protegida) e registrando em journal se a rota
 *       protegida chegou SEM header `Authorization` (transporte por cookie,
 *       não por bearer).
 *
 * POR QUE SEM O bundle do client.ts NO BROWSER: `src/lib/api/client.ts` usa
 * o alias `@/` e o ambiente XLT (sem webServer/build, por `xlt.config.ts`)
 * não tem bundler resolvível para servir o módulo real na página. A forma
 * exata da requisição que o client emite (sem `Authorization` quando o store
 * está vazio, `credentials: "include"` sempre, fallback com bearer quando
 * presente) está travada pelos units T2.2
 * (`src/lib/api/__tests__/cookie-first.t2-2.test.ts`, que importam o
 * `apiFetch` real). Este XLT prova o CROSSING que os units não alcançam:
 * cookie HttpOnly → reenvio automático do browser → autenticado, com
 * localStorage limpo de bearers novos.
 */

import { test, expect } from "@playwright/test";
import http from "node:http";
import crypto from "node:crypto";
import type { AddressInfo } from "node:net";

const SESSION_COOKIE = "better-auth.session_token";
const LEGACY_SESSION_KEY = "pi-finance:session-token";
const LEGACY_TOKEN_KEY = "pi-finance:token";

type JournalEntry = {
  method: string;
  path: string;
  hasCookie: boolean;
  hasAuthorization: boolean;
};

let server: http.Server;
let baseURL: string;
let sessionValue: string;
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

function handler(req: http.IncomingMessage, res: http.ServerResponse): void {
  const url = new URL(req.url ?? "/", "http://fixture");
  const cookie = (req.headers.cookie as string | undefined) ?? "";
  const record = (path: string): void => {
    journal.push({
      method: req.method ?? "",
      path,
      hasCookie: cookie.includes(`${SESSION_COOKIE}=`),
      hasAuthorization: req.headers.authorization !== undefined,
    });
  };

  if (url.pathname === "/" && req.method === "GET") {
    res.statusCode = 200;
    res.setHeader("content-type", "text/html");
    res.end("<!doctype html><html><body>xlt-02</body></html>");
    return;
  }

  if (url.pathname === "/api/backend/auth/sign-in/email" && req.method === "POST") {
    void readBody(req).then(() => {
      sessionValue = crypto.randomBytes(16).toString("hex");
      record(url.pathname);
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      // Contrato do proxy: repasse de Set-Cookie HttpOnly; corpo SEM bearer.
      res.setHeader(
        "set-cookie",
        `${SESSION_COOKIE}=${sessionValue}; Path=/; HttpOnly; SameSite=Lax`,
      );
      res.end(JSON.stringify({ token: null, user: { id: "u1", email: "u@example.test" } }));
    });
    return;
  }

  if (url.pathname === "/api/backend/workspaces" && req.method === "GET") {
    record(url.pathname);
    if (!cookie.includes(`${SESSION_COOKIE}=`)) {
      res.statusCode = 401;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ok: false, error: { code: "auth.session_required" } }));
      return;
    }
    res.statusCode = 200;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ items: [] }));
    return;
  }

  res.statusCode = 404;
  res.end("not found");
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
  sessionValue = "";
});

test("[XLT-02] login sets an HttpOnly cookie and no new bearer lands in localStorage", async ({
  page,
  context,
}) => {
  await page.goto(`${baseURL}/`);

  const login = await page.evaluate(async (base: string) => {
    const res = await fetch(`${base}/api/backend/auth/sign-in/email`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "u@example.test", password: "password123" }),
    });
    return { status: res.status, body: await res.json() };
  }, baseURL);
  expect(login.status).toBe(200);
  // Corpo do login não emite bearer novo (cookie-first, sem segunda emissão).
  expect((login.body as { token: unknown }).token).toBeNull();

  // Cookie presente no jar — e marcado HttpOnly (não legível via JS).
  const cookies = await context.cookies();
  const session = cookies.find((c) => c.name === SESSION_COOKIE);
  expect(session).toBeDefined();
  expect(session!.httpOnly).toBe(true);

  const readable = await page.evaluate(() => document.cookie);
  expect(readable).not.toContain(SESSION_COOKIE);

  // localStorage SEM tokens novos.
  const stored = await page.evaluate(
    ([sessionKey, tokenKey]) => ({
      session: localStorage.getItem(sessionKey),
      token: localStorage.getItem(tokenKey),
    }),
    [LEGACY_SESSION_KEY, LEGACY_TOKEN_KEY] as const,
  );
  expect(stored.session).toBeNull();
  expect(stored.token).toBeNull();
});

test("[XLT-02] cookie authenticates the protected route with no Authorization header", async ({
  page,
}) => {
  await page.goto(`${baseURL}/`);
  await page.evaluate(async (base: string) => {
    const res = await fetch(`${base}/api/backend/auth/sign-in/email`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "u@example.test", password: "password123" }),
    });
    if (!res.ok) throw new Error(`login failed: ${res.status}`);
  }, baseURL);

  // Contrato exato do client.ts com store vazio: sem Authorization,
  // credentials:include — o cookie faz o transporte.
  const protectedRes = await page.evaluate(async (base: string) => {
    const res = await fetch(`${base}/api/backend/workspaces`, {
      credentials: "include",
    });
    return { status: res.status, body: await res.json() };
  }, baseURL);
  expect(protectedRes.status).toBe(200);

  const wire = journal.filter((entry) => entry.path === "/api/backend/workspaces");
  expect(wire).toHaveLength(1);
  expect(wire[0]!.hasCookie).toBe(true);
  expect(wire[0]!.hasAuthorization).toBe(false);
});

test("[XLT-02] without the cookie the protected route is 401 (cookie is the authenticator)", async ({
  page,
}) => {
  await page.goto(`${baseURL}/`);
  const protectedRes = await page.evaluate(async (base: string) => {
    const res = await fetch(`${base}/api/backend/workspaces`, {
      credentials: "include",
    });
    return res.status;
  }, baseURL);
  expect(protectedRes).toBe(401);
});
