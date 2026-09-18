#!/usr/bin/env node

/**
 * Deploy-origin validation (DEBT2-CODER-ALLOWLISTS-FIX, security review HIGH:
 * workflow shell-injection hardening).
 *
 * GitHub `vars.*` contexts must NEVER be interpolated into `run:` script
 * text. Workflows put them only in step `env:` values and call this helper,
 * which URL-parses the value, pins it against the exact expected production
 * host, and persists ONLY the sanitized canonical origin to $GITHUB_ENV.
 * Deploy steps then use the quoted env variable (e.g.
 * `--var "PWA_ORIGIN:$PWA_PROD_URL"`).
 *
 * Rejection rules (fail closed, non-zero exit): empty/blank, unparseable,
 * non-https scheme, any userinfo, explicit port, non-empty path/query/hash,
 * or any host other than the expected one. Error messages name the variable
 * and the violated rule — they NEVER echo the value (no secret/URL leak
 * into logs, and no log-injection via crafted values).
 */

import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

/**
 * Exact production hosts. Pinned allowlist for deploy validation — the only
 * hosts a deploy may target. Values being PINNED, not secrets; presence is
 * an irreducible detector-like exception, allowlisted in
 * scripts/check-public-safety.mjs with reason and covered by
 * validate-deploy-origins.test.mjs (the safety gate: any host change breaks
 * those tests loudly before it can ship).
 */
export const EXPECTED_PWA_HOST = "pi-finance-pwa.walissonead.workers.dev";
export const EXPECTED_AGENT_HOST = "pi-finance-agent.walissonead.workers.dev";

/**
 * Validates a deploy origin and returns its canonical form
 * (`https://<expected-host>`). Throws DEPLOY_ORIGIN_INVALID on any rule
 * violation. Never includes the value in the message.
 */
export function validateProdOrigin(varName, rawValue, expectedHost) {
  const value = (rawValue ?? "").trim();
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`DEPLOY_ORIGIN_INVALID: ${varName} is not a valid absolute URL`);
  }
  const violations = [];
  if (parsed.protocol !== "https:") violations.push("scheme must be https");
  if (parsed.username !== "" || parsed.password !== "") violations.push("must not contain userinfo");
  if (parsed.hostname !== expectedHost) violations.push("unexpected host");
  if (parsed.port !== "") violations.push("must not contain an explicit port");
  if (parsed.pathname !== "" && parsed.pathname !== "/") violations.push("must not contain a path");
  if (parsed.search !== "") violations.push("must not contain a query string");
  if (parsed.hash !== "") violations.push("must not contain a fragment");
  if (violations.length > 0) {
    throw new Error(`DEPLOY_ORIGIN_INVALID: ${varName} ${violations.join("; ")}`);
  }
  return `https://${expectedHost}`;
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--name") out.name = argv[++i];
    else if (argv[i] === "--expect") out.expect = argv[++i];
    else if (argv[i] === "--env-file") out.envFile = argv[++i];
  }
  return out;
}

function main() {
  const { name, expect, envFile } = parseArgs(process.argv.slice(2));
  if (!name || (expect !== "pwa" && expect !== "agent") || !envFile) {
    console.error("Usage: validate-deploy-origins.mjs --name VAR --expect pwa|agent --env-file $GITHUB_ENV");
    process.exit(2);
  }
  const expectedHost = expect === "pwa" ? EXPECTED_PWA_HOST : EXPECTED_AGENT_HOST;
  let sanitized;
  try {
    sanitized = validateProdOrigin(name, process.env[name], expectedHost);
  } catch (err) {
    console.error(`Fatal: ${(err && err.message) || err}`);
    process.exit(1);
  }
  appendFileSync(envFile, `${name}=${sanitized}\n`);
  console.log(`validated ${name}: host pinned to the expected production host (value not echoed)`);
}

const invokedDirectly =
  typeof process.argv[1] === "string" &&
  import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) main();
