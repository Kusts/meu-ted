/**
 * XLT-05 — Production CSP keeps the browser same-origin (V4 T2.7 G1, SPEC §13).
 *
 * Real layers crossed (3):
 *   (a) production config — buildCspValue(nonce, false) from src/proxy-utils.ts
 *       (the SAME function src/middleware.ts emits): connect-src 'self' with
 *       no external API/Agent origin;
 *   (b) HTTP really emitted — an ephemeral node:http server serves a document
 *       carrying that exact production CSP header on the wire;
 *   (c) real Chromium enforcement — fetch() to a forbidden external origin
 *       rejects and surfaces a connect-src CSP violation on the console,
 *       while a same-origin fetch succeeds.
 *
 * The external fetch never leaves the browser (blocked pre-network), so this
 * test needs no outside connectivity.
 */

import { test, expect } from "@playwright/test";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { buildCspValue, generateNonce } from "../../src/proxy-utils";

const EXTERNAL_ORIGIN = "https://api.synkroo.com.br";

function probePage(): string {
  return `<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8"><title>XLT-05 CSP probe</title></head>
<body>
<script nonce="__NONCE__">
  window.__xlt05 = {
    probeExternal: async () => {
      try {
        await fetch(${JSON.stringify(`${EXTERNAL_ORIGIN}/health`)});
        return "allowed";
      } catch (e) {
        return "blocked:" + (e && e.name ? e.name : "unknown");
      }
    },
    probeSelf: async () => {
      const res = await fetch("/api/ping");
      const body = await res.json();
      return body && body.ok === true ? "self-ok" : "self-bad";
    },
  };
</script>
</body>
</html>`;
}

let server: http.Server;
let baseURL: string;

test.beforeAll(async () => {
  const page = probePage();
  server = http.createServer((req, res) => {
    if (req.url === "/api/ping") {
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    if (req.url === "/probe") {
      const nonce = generateNonce();
      res.setHeader("Content-Security-Policy", buildCspValue(nonce, false));
      res.setHeader("x-nonce", nonce);
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(page.replaceAll("__NONCE__", nonce));
      return;
    }
    res.statusCode = 404;
    res.end("not found");
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

test("[XLT-05] production CSP config is same-origin (no external connect target)", () => {
  const csp = buildCspValue("a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4", false);
  expect(csp).toContain("connect-src 'self'");
  expect(csp).not.toContain("api.synkroo.com.br");
  expect(csp).not.toContain("workers.dev");
});

test("[XLT-05] Chromium blocks the external fetch and allows same-origin", async ({
  page,
}) => {
  const violations: string[] = [];
  page.on("console", (msg) => {
    const text = msg.text();
    if (/content security policy|connect-src/i.test(text)) violations.push(text);
  });

  const response = await page.goto(`${baseURL}/probe`);
  expect(response).not.toBeNull();
  const csp = response!.headers()["content-security-policy"] ?? "";
  expect(csp).toContain("connect-src 'self'");
  expect(csp).not.toContain("api.synkroo.com.br");

  const external = await page.evaluate(() => window.__xlt05.probeExternal());
  expect(String(external).startsWith("blocked:")).toBe(true);

  const self = await page.evaluate(() => window.__xlt05.probeSelf());
  expect(self).toBe("self-ok");

  expect(violations.length).toBeGreaterThan(0);
});
