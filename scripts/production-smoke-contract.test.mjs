import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const workflow = fs.readFileSync('.github/workflows/production-smoke.yml', 'utf8');
const config = fs.readFileSync('apps/pwa/e2e/playwright.config.ts', 'utf8');
const localE2eRunner = fs.readFileSync('apps/pwa/e2e/run-ci.sh', 'utf8');
const smoke = fs.readFileSync('apps/pwa/e2e/specs/production-smoke.spec.ts', 'utf8');
const runbook = fs.readFileSync('docs/runbooks/pwa-cloudflare-release.md', 'utf8');
const buildInfoRoute = fs.readFileSync('apps/pwa/src/app/api/build-info/route.ts', 'utf8');
const apiHealth = fs.readFileSync('apps/api/src/routes/index.ts', 'utf8');
const agentWorker = fs.readFileSync('apps/agent/src/worker.ts', 'utf8');

test('production smoke is manual and receives an explicit deployed URL', () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /E2E_PRODUCTION_URL/);
  assert.match(workflow, /E2E_PRODUCTION_SMOKE: "1"/);
  assert.match(workflow, /--project=production-smoke/);
});

test('production smoke does not start local fixture servers', () => {
  assert.match(config, /PRODUCTION_SMOKE \? undefined : \[/);
  assert.match(config, /E2E_PRODUCTION_URL is required/);
  assert.match(smoke, /gotoReadOnly/);
  assert.match(smoke, /production smoke emitted writes/);
  assert.match(smoke, /\["GET", "HEAD", "OPTIONS"\]/);
});

test('local PWA E2E runner pins both API paths to local fixtures and clears live opt-ins', () => {
  assert.match(localE2eRunner, /export NEXT_PUBLIC_PI_FINANCE_API_BASE_URL="http:\/\/127\.0\.0\.1:4010"/);
  assert.match(localE2eRunner, /export NEXT_PUBLIC_LEGACY_BEARER_COMPAT="off"/);
  assert.match(localE2eRunner, /export PWA_BACKEND_PROXY_ORIGIN="http:\/\/127\.0\.0\.1:4010"/);
  assert.match(localE2eRunner, /standalone-server\.mjs/);
  assert.doesNotMatch(localE2eRunner, /next start --port/);
  assert.match(localE2eRunner, /--project=functional-mobile \\\n\s+--workers=1 --retries=1/);
  assert.match(localE2eRunner, /export PWA_LIVE_E2E="0"/);
  assert.match(localE2eRunner, /export PWA_LIVE_BASE_URL="http:\/\/127\.0\.0\.1:3000"/);
  assert.match(localE2eRunner, /export E2E_PRODUCTION_SMOKE="0"/);
  assert.match(localE2eRunner, /export E2E_PRODUCTION_URL=""/);
  assert.match(localE2eRunner, /export PWA_AGENT_PROXY_ORIGIN=""/);
  assert.match(localE2eRunner, /export AGENT_ORIGIN=""/);
  assert.match(localE2eRunner, /export NEXT_PUBLIC_PI_FINANCE_AGENT_BASE_URL=""/);
});

test('runbook documents smoke before and rollback after a release', () => {
  assert.match(runbook, /Production smoke \(post-deploy, read-only\)/i);
  assert.match(runbook, /wrangler rollback/);
  assert.match(runbook, /same read-only production smoke workflow/i);
});

test('release identity is exposed by all three runtimes (V4.1 Task 9.9)', () => {
  assert.match(buildInfoRoute, /build-info/);
  assert.match(buildInfoRoute, /getBuildInfo/);
  assert.match(apiHealth, /gitSha/);
  assert.match(apiHealth, /BUILD_SHA/);
  assert.match(agentWorker, /buildSha/);
  assert.match(agentWorker, /BUILD_SHA/);
});

test('production smoke confirms the deployed SHA (V4.1 Task 9.10)', () => {
  assert.match(smoke, /SMOKE-05/);
  assert.match(smoke, /\/api\/build-info/);
  assert.match(smoke, /EXPECTED_SHA/);
});
