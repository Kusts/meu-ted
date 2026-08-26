import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const workflow = fs.readFileSync('.github/workflows/production-smoke.yml', 'utf8');
const config = fs.readFileSync('apps/pwa/e2e/playwright.config.ts', 'utf8');
const smoke = fs.readFileSync('apps/pwa/e2e/specs/production-smoke.spec.ts', 'utf8');
const runbook = fs.readFileSync('docs/runbooks/pwa-cloudflare-release.md', 'utf8');

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

test('runbook documents smoke before and rollback after a release', () => {
  assert.match(runbook, /Production smoke \(post-deploy, read-only\)/i);
  assert.match(runbook, /wrangler rollback/);
  assert.match(runbook, /same read-only production smoke workflow/i);
});
