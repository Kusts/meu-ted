import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { resolveConfig } from "./contract-cors.mjs";

const here = dirname(fileURLToPath(import.meta.url));

// ---- no production host literal may live in-repo (DEBT2) ----

test("contract-cors carries no production PWA host literal", () => {
  const source = readFileSync(join(here, "contract-cors.mjs"), "utf8");
  assert.ok(!source.includes("workers.dev"), "production host literal leaked into contract-cors.mjs");
});

// ---- local defaults never silently probe production ----

test("skips the live check when no PWA origin is configured", () => {
  const cfg = resolveConfig({});
  assert.equal(cfg.pwaOrigin, null);
  assert.equal(cfg.live, false);
});

test("blank env values count as unconfigured (skip, not silent prod probe)", () => {
  const cfg = resolveConfig({ PWA_PROD_URL: "   ", PWA_ORIGIN: "" });
  assert.equal(cfg.pwaOrigin, null);
  assert.equal(cfg.live, false);
});

// ---- CI injects the production host via repo variable ----

test("prefers PWA_PROD_URL (CI repo variable) over PWA_ORIGIN", () => {
  const cfg = resolveConfig({ PWA_PROD_URL: "https://pwa.example.net", PWA_ORIGIN: "https://pwa.example.org" });
  assert.equal(cfg.pwaOrigin, "https://pwa.example.net");
  assert.equal(cfg.live, true);
});

test("accepts PWA_ORIGIN alone and trims whitespace", () => {
  const cfg = resolveConfig({ PWA_ORIGIN: "  https://pwa.example.net  " });
  assert.equal(cfg.pwaOrigin, "https://pwa.example.net");
  assert.equal(cfg.live, true);
});

test("API base stays overridable with a safe default", () => {
  assert.equal(resolveConfig({}).apiBaseUrl, "https://api.synkroo.com.br");
  assert.equal(
    resolveConfig({ PWA_CONTRACT_API_BASE_URL: "http://127.0.0.1:3001" }).apiBaseUrl,
    "http://127.0.0.1:3001",
  );
});

test("hostile origin stays a reserved example domain", () => {
  assert.equal(resolveConfig({}).hostileOrigin, "https://evil.example.com");
});
