import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  EXPECTED_AGENT_HOST,
  EXPECTED_PWA_HOST,
  validateProdOrigin,
} from "./validate-deploy-origins.mjs";

const here = dirname(fileURLToPath(import.meta.url));

// ---- pinned hosts are the detector-like exception (allowlisted with reason) ----

test("helper carries exactly the two pinned production hosts", () => {
  const source = readFileSync(join(here, "validate-deploy-origins.mjs"), "utf8");
  assert.ok(source.includes(EXPECTED_PWA_HOST));
  assert.ok(source.includes(EXPECTED_AGENT_HOST));
  assert.equal(EXPECTED_PWA_HOST, "pi-finance-pwa.walissonead.workers.dev");
  assert.equal(EXPECTED_AGENT_HOST, "pi-finance-agent.walissonead.workers.dev");
});

// ---- valid exact origins pass and normalize ----

test("accepts the exact pinned origins (trailing slash normalizes)", () => {
  assert.equal(validateProdOrigin("PWA_PROD_URL", `https://${EXPECTED_PWA_HOST}`, EXPECTED_PWA_HOST), `https://${EXPECTED_PWA_HOST}`);
  assert.equal(validateProdOrigin("AGENT_PROD_URL", `https://${EXPECTED_AGENT_HOST}/`, EXPECTED_AGENT_HOST), `https://${EXPECTED_AGENT_HOST}`);
});

test("trims surrounding whitespace", () => {
  assert.equal(
    validateProdOrigin("PWA_PROD_URL", `  https://${EXPECTED_PWA_HOST}  `, EXPECTED_PWA_HOST),
    `https://${EXPECTED_PWA_HOST}`,
  );
});

// ---- structural rejections ----

test("rejects empty, blank, and unparseable values", () => {
  for (const bad of ["", "   ", undefined, null, "not-a-url"]) {
    assert.throws(() => validateProdOrigin("PWA_PROD_URL", bad, EXPECTED_PWA_HOST), /DEPLOY_ORIGIN_INVALID/);
  }
});

test("rejects scheme downgrade and explicit ports", () => {
  assert.throws(() => validateProdOrigin("V", `http://${EXPECTED_PWA_HOST}`, EXPECTED_PWA_HOST), /scheme must be https/);
  assert.throws(() => validateProdOrigin("V", `https://${EXPECTED_PWA_HOST}:8443`, EXPECTED_PWA_HOST), /explicit port/);
});

test("rejects userinfo smuggling", () => {
  assert.throws(
    () => validateProdOrigin("V", `https://user:pass@${EXPECTED_PWA_HOST}/`, EXPECTED_PWA_HOST),
    /userinfo/,
  );
  assert.throws(
    () => validateProdOrigin("V", `https://${EXPECTED_PWA_HOST}@evil.example/`, EXPECTED_PWA_HOST),
    /unexpected host/,
  );
});

test("rejects path, query, and fragment", () => {
  assert.throws(() => validateProdOrigin("V", `https://${EXPECTED_PWA_HOST}/x`, EXPECTED_PWA_HOST), /path/);
  assert.throws(() => validateProdOrigin("V", `https://${EXPECTED_PWA_HOST}?q=1`, EXPECTED_PWA_HOST), /query/);
  assert.throws(() => validateProdOrigin("V", `https://${EXPECTED_PWA_HOST}#h`, EXPECTED_PWA_HOST), /fragment/);
});

test("rejects wrong and lookalike hosts", () => {
  assert.throws(() => validateProdOrigin("V", "https://agent.example.net", EXPECTED_AGENT_HOST), /unexpected host/);
  assert.throws(
    () => validateProdOrigin("V", `https://${EXPECTED_AGENT_HOST}.evil.example`, EXPECTED_AGENT_HOST),
    /unexpected host/,
  );
  // PWA host is not valid where the agent host is expected (and vice versa).
  assert.throws(
    () => validateProdOrigin("V", `https://${EXPECTED_PWA_HOST}`, EXPECTED_AGENT_HOST),
    /unexpected host/,
  );
});

// ---- shell-metacharacter payloads never validate ----

test("rejects shell metacharacter injection forms", () => {
  const evil = [
    `https://${EXPECTED_AGENT_HOST}"; curl evil.example #`,
    `$(curl evil.example)https://${EXPECTED_AGENT_HOST}`,
    `\`curl evil.example\`https://${EXPECTED_AGENT_HOST}`,
    `https://${EXPECTED_AGENT_HOST} && curl evil.example`,
    `https://${EXPECTED_AGENT_HOST} | curl evil.example`,
    `https://${EXPECTED_AGENT_HOST}\nEVIL=1`,
    `https://${EXPECTED_AGENT_HOST}\r\nEVIL=1`,
  ];
  for (const bad of evil) {
    assert.throws(() => validateProdOrigin("AGENT_PROD_URL", bad, EXPECTED_AGENT_HOST), /DEPLOY_ORIGIN_INVALID/, JSON.stringify(bad));
  }
});

// ---- errors never echo the (possibly malicious) value ----

test("error messages do not echo the rejected value", () => {
  const marker = "evil-marker-9z8x";
  try {
    validateProdOrigin("AGENT_PROD_URL", `https://${marker}.example`, EXPECTED_AGENT_HOST);
    assert.fail("should have thrown");
  } catch (err) {
    assert.match(err.message, /DEPLOY_ORIGIN_INVALID/);
    assert.ok(!err.message.includes(marker), "value leaked into error message");
  }
});
