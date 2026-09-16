/**
 * XLT-04 — Development edge allows localhost with the explicit flag
 * (V4 T2.7 G3/G4, SPEC §13).
 *
 * Real layers crossed (2):
 *   (a) development config — isLocalBypassEnabled({ NODE_ENV: "development",
 *       ALLOW_LOCAL_ORIGIN: "1" }) is true, so isBrowserOriginAllowed()
 *       accepts localhost and resolveForwardOrigin() spoofs it to the
 *       production host (the upstream trustedOrigins escape hatch);
 *   (b) HTTP really emitted — an ephemeral node:http server applying the SAME
 *       shared gate answers a localhost-Origin POST with 200 and the spoofed
 *       origin, while the same server with the flag absent answers 403.
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

const DEV_ENV = { NODE_ENV: "development", ALLOW_LOCAL_ORIGIN: "1" };
const DEV_ENV_NO_FLAG = { NODE_ENV: "development" };

function handlerFor(env: typeof DEV_ENV) {
  return (req: http.IncomingMessage, res: http.ServerResponse): void => {
    const origin = (req.headers.origin as string | undefined) ?? null;
    const url = `http://${req.headers.host}${req.url}`;
    if (req.method !== "GET" && req.method !== "HEAD" && req.method !== "OPTIONS") {
      if (!isBrowserOriginAllowed(origin, url, env)) {
        res.statusCode = 403;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ ok: false, error: { code: "csrf.origin_mismatch" } }));
        return;
      }
    }
    res.statusCode = 200;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ forwardedOrigin: resolveForwardOrigin(origin, env) }));
  };
}

let server: http.Server;
let baseURL: string;

test.beforeAll(async () => {
  server = http.createServer((req, res) => {
    if (req.url?.startsWith("/no-flag")) {
      const stripped = req.url.replace("/no-flag", "") || "/";
      req.url = stripped;
      handlerFor(DEV_ENV_NO_FLAG)(req, res);
    } else {
      handlerFor(DEV_ENV)(req, res);
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  baseURL = `http://127.0.0.1:${port}`;
});

test.afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
});

test("[XLT-04] development config enables the bypass only with the explicit flag", () => {
  expect(isLocalBypassEnabled(DEV_ENV)).toBe(true);
  expect(isLocalBypassEnabled(DEV_ENV_NO_FLAG)).toBe(false);
  expect(
    isBrowserOriginAllowed("http://localhost:3000", `${baseURL}/api/backend/x`, DEV_ENV),
  ).toBe(true);
  expect(resolveForwardOrigin("http://localhost:3000", DEV_ENV)).toBe(
    PRODUCTION_PWA_ORIGIN,
  );
});

test("[XLT-04] localhost-Origin POST passes on the wire with the flag", async () => {
  const res = await fetch(`${baseURL}/api/backend/payables`, {
    method: "POST",
    headers: { origin: "http://localhost:3000", "content-type": "application/json" },
    body: "{}",
  });
  expect(res.status).toBe(200);
  const body = (await res.json()) as { forwardedOrigin: string };
  expect(body.forwardedOrigin).toBe(PRODUCTION_PWA_ORIGIN);
});

test("[XLT-04] localhost-Origin POST is rejected without the flag", async () => {
  const res = await fetch(`${baseURL}/no-flag/api/backend/payables`, {
    method: "POST",
    headers: { origin: "http://localhost:3000", "content-type": "application/json" },
    body: "{}",
  });
  expect(res.status).toBe(403);
});
