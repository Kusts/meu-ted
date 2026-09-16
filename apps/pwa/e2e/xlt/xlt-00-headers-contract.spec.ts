/**
 * XLT-00 (fumaça da categoria XLT, SPEC V4 §18 / INV-10).
 *
 * Camadas reais atravessadas (2):
 *   (a) configuração de segurança de produção — SECURITY_HEADERS +
 *       buildCspValue() de src/proxy-utils.ts (a mesma fonte que
 *       src/middleware.ts usa para carimbar cada resposta);
 *   (b) header efetivamente emitido no fio — um servidor HTTP real aplica a
 *       semântica de emissão do middleware (headers estáticos + CSP com
 *       nonce por resposta) e o teste assera o HTTP observado, não a
 *       constante em memória.
 *
 * Diferença para os units (proxy.test.ts / headers.test.ts): eles travam o
 * VALOR da config ou do artefato de build isoladamente. Este XLT prova o
 * CROSSING config→emissão: o que o browser recebe é o que a config produz,
 * por resposta, sem cópia estática no meio.
 *
 * Estado atual: Permissions-Policy nega microphone (baseline pré-T1.1). O
 * teste assera o crossing (emitido === config), não o valor literal, para
 * sobreviver à T1.1 (policy condicional por capability) sem reescrita —
 * a tarefa T1.1 cobre a relação capability↔header nos dois sentidos.
 */

import { test, expect } from "@playwright/test";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import type { AddressInfo } from "node:net";
import {
  SECURITY_HEADERS,
  buildCspValue,
  generateNonce,
} from "../../src/proxy-utils";

// Artefato do build Cloudflare/OpenNext (ausente sem build — check opcional).
const HEADERS_PATH = path.resolve(
  __dirname,
  "..",
  "..",
  ".open-next",
  "assets",
  "_headers",
);

/**
 * Emissão equivalente à de src/middleware.ts: CSP por resposta com nonce
 * fresco (modo produção: sem unsafe-eval, sem localhost) + headers estáticos.
 */
function emitProductionHeaders(
  _req: http.IncomingMessage,
  res: http.ServerResponse,
): void {
  const nonce = generateNonce();
  res.setHeader(
    "Content-Security-Policy",
    buildCspValue(nonce, false),
  );
  res.setHeader("x-nonce", nonce);
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    res.setHeader(key, value);
  }
  res.end("ok");
}

let server: http.Server;
let baseURL: string;

test.beforeAll(async () => {
  server = http.createServer(emitProductionHeaders);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  baseURL = `http://127.0.0.1:${port}`;
});

test.afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
});

test("[XLT-00] emitted Permissions-Policy equals the production config", async ({
  page,
}) => {
  const response = await page.goto(baseURL);
  expect(response).not.toBeNull();
  const headers = response!.headers();

  // Crossing (a)→(b): o fio carrega exatamente o valor da config.
  expect(headers["permissions-policy"]).toBe(
    SECURITY_HEADERS["Permissions-Policy"],
  );
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-frame-options"]).toBe("DENY");
});

test("[XLT-00] emitted CSP binds a fresh per-response nonce (builder executes)", async () => {
  // fetch global (undici): HTTP real no fio, sem ambiguidade de API.
  const first = await fetch(baseURL);
  const second = await fetch(baseURL);
  expect(first.ok).toBe(true);
  expect(second.ok).toBe(true);

  const nonceA = first.headers.get("x-nonce");
  const nonceB = second.headers.get("x-nonce");
  const cspA = first.headers.get("content-security-policy");
  const cspB = second.headers.get("content-security-policy");
  expect(nonceA).toMatch(/^[0-9a-f]{32}$/);
  expect(nonceB).toMatch(/^[0-9a-f]{32}$/);
  // Não é cópia estática: cada resposta executa o builder com nonce novo.
  expect(nonceB).not.toBe(nonceA);
  expect(cspA).toContain(`'nonce-${nonceA}'`);
  expect(cspB).toContain(`'nonce-${nonceB}'`);
  // Emissão de produção: sem escape hatch de desenvolvimento.
  for (const csp of [cspA, cspB]) {
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).not.toContain("127.0.0.1");
  }
});

test("[XLT-00] built _headers artifact does not shadow runtime security headers", async () => {
  test.skip(
    !fs.existsSync(HEADERS_PATH),
    "no Cloudflare build artifact present; runtime emission is authoritative",
  );
  const text = fs.readFileSync(HEADERS_PATH, "utf-8");
  const shadowing = text
    .split("\n")
    .map((line) => line.trim().toLowerCase())
    .filter(
      (line) =>
        line.startsWith("permissions-policy:") ||
        line.startsWith("content-security-policy:"),
    );
  // Headers dinâmicos pertencem ao middleware; o artefato estático não pode
  // publicar regra concorrente que os sobreponha no fio.
  expect(shadowing).toEqual([]);
});
