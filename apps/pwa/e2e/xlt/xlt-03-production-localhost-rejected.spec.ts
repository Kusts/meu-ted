/**
 * XLT-03 — Production edge rejects localhost (V4 T2.7 G3, SPEC §13).
 *
 * Real layers crossed (2):
 *   (a) production config — isLocalBypassEnabled({ NODE_ENV: "production" })
 *       is false even with ALLOW_LOCAL_ORIGIN=1, so isBrowserOriginAllowed()
 *       denies localhost and resolveForwardOrigin() never spoofs;
 *   (b) HTTP really emitted — an ephemeral node:http server applying the SAME
 *       shared gate the Next proxies call (not a reimplementation) answers a
 *       localhost-Origin POST with 403 csrf.origin_mismatch and forwards a
 *       localhost Origin unspoofed, while a same-origin POST passes.
 *
 * Node fetch (undici) sets the Origin header explicitly — page JS cannot,
 * so the wire assertions use the global fetch, like XLT-00 does.
 */

import { test, expect } from "@playwright/test";
import http from "node:http";
import type { AddressInfo } from "node:net";
import {
  PRODUCTION_PWA_ORIGIN,
  isBrowserOriginAllowed,
  isLocalBypassEnabled,
  resolveForwardOrigin,
} from "../../src/proxy-utils";

// Production config: the explicit flag does NOT open the bypass here.
const PROD_ENV = { NODE_ENV: "production", ALLOW_LOCAL_ORIGIN: "1" };

function gateHandler(req: http.IncomingMessage, res: http.ServerResponse): void {
  const origin = (req.headers.origin as string | undefined) ?? null;
  const url = `http://${req.headers.host}${req.url}`;
  if (req.method !== "GET" && req.method !== "HEAD" && req.method !== "OPTIONS") {
    if (!isBrowserOriginAllowed(origin, url, PROD_ENV)) {
      res.statusCode = 403;
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify({
          ok: false,
          error: { code: "csrf.origin_mismatch", message: "Origem da requisição não autorizada." },
        }),
      );
      return;
    }
  }
  res.statusCode = 200;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify({ forwardedOrigin: resolveForwardOrigin(origin, PROD_ENV) }));
}

let server: http.Server;
let baseURL: string;

test.beforeAll(async () => {
  server = http.createServer(gateHandler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  baseURL = `http://127.0.0.1:${port}`;
});

test.afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
});

test("[XLT-03] production config never enables the localhost bypass", () => {
  expect(isLocalBypassEnabled(PROD_ENV)).toBe(false);
  expect(isLocalBypassEnabled({ NODE_ENV: "production" })).toBe(false);
  expect(
    isBrowserOriginAllowed("http://localhost:3000", `${baseURL}/api/backend/x`, PROD_ENV),
  ).toBe(false);
  expect(resolveForwardOrigin("http://localhost:3000", PROD_ENV)).toBe(
    "http://localhost:3000",
  );
});

test("[XLT-03] localhost-Origin POST is rejected on the wire in production", async () => {
  const res = await fetch(`${baseURL}/api/backend/payables`, {
    method: "POST",
    headers: { origin: "http://localhost:3000", "content-type": "application/json" },
    body: "{}",
  });
  expect(res.status).toBe(403);
  const body = (await res.json()) as { ok: boolean; error: { code: string } };
  expect(body.ok).toBe(false);
  expect(body.error.code).toBe("csrf.origin_mismatch");
});

test("[XLT-03] production never spoofs localhost upstream (fail-closed forward)", async () => {
  const res = await fetch(`${baseURL}/api/backend/me`, {
    headers: { origin: "http://localhost:3000" },
  });
  expect(res.status).toBe(200);
  const body = (await res.json()) as { forwardedOrigin: string };
  expect(body.forwardedOrigin).toBe("http://localhost:3000");
  expect(body.forwardedOrigin).not.toBe(PRODUCTION_PWA_ORIGIN);
});

test("[XLT-03] same-origin traffic still passes in production", async () => {
  const sameOrigin = baseURL;
  const res = await fetch(`${baseURL}/api/backend/payables`, {
    method: "POST",
    headers: { origin: sameOrigin, "content-type": "application/json" },
    body: "{}",
  });
  expect(res.status).toBe(200);
});
