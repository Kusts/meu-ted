import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const secretScript = fs.readFileSync('scripts/security-secrets.mjs', 'utf8');
const containerScript = fs.readFileSync('scripts/security-containers.mjs', 'utf8');
const gitleaksConfig = fs.readFileSync('.gitleaks.toml', 'utf8');
const workflow = fs.readFileSync('.github/workflows/ci.yml', 'utf8');
const apiDockerfile = fs.readFileSync('apps/api/Dockerfile', 'utf8');
const brokerDockerfile = fs.readFileSync('apps/codex-broker/Dockerfile', 'utf8');

for (const name of ['security:secrets', 'security:deps', 'security:containers']) {
  test(`package exposes ${name}`, () => {
    assert.equal(typeof packageJson.scripts[name], 'string');
    assert.notEqual(packageJson.scripts[name].trim(), '');
  });
}

test('secret gate uses a cross-platform script with pinned Gitleaks, read-only source, and redaction', () => {
  assert.equal(packageJson.scripts['security:secrets'], 'node scripts/security-secrets.mjs');
  assert.match(secretScript, /zricethezav\/gitleaks:v8\.24\.2/);
  assert.match(secretScript, /detect/);
  assert.match(secretScript, /--config=\/repo\/\.gitleaks\.toml/);
  assert.match(secretScript, /:ro/);
  assert.match(secretScript, /--redact/);
  assert.match(secretScript, /--exit-code/);
  assert.match(secretScript, /shell: false/);
});

test('Gitleaks allowlist is limited to deleted historical test fixtures', () => {
  assert.match(gitleaksConfig, /bridge-full-coverage/);
  assert.match(gitleaksConfig, /tools-contract/);
  assert.match(gitleaksConfig, /idempotency/);
  assert.match(gitleaksConfig, /deterministic non-secret identifiers/);
});

test('dependency gate audits dependencies', () => {
  const command = packageJson.scripts['security:deps'];
  assert.match(command, /pnpm audit/);
  assert.match(command, /--audit-level(?:=| )(?:moderate|critical)/);
});

test('container gate fails on high or critical vulnerabilities for both CI images', () => {
  assert.equal(packageJson.scripts['security:containers'], 'node scripts/security-containers.mjs');
  assert.match(containerScript, /aquasec\/trivy:0\.58\.1/);
  assert.match(containerScript, /trivy-cache:\/root\/\.cache\/trivy/);
  assert.match(containerScript, /--exit-code/);
  assert.match(containerScript, /HIGH,CRITICAL/);
  assert.match(containerScript, /pi-finance-api:ci/);
  assert.match(containerScript, /pi-finance-codex-broker:ci/);
  assert.match(containerScript, /shell: false/);
});

test('runtime images install dependencies and exclude package-manager stores', () => {
  assert.match(apiDockerfile, /pnpm install --frozen-lockfile/);
  assert.match(brokerDockerfile, /pnpm install --frozen-lockfile/);
  assert.match(apiDockerfile, /FROM node:22-alpine/);
});

test('CI security job runs scans and global gate depends on it', () => {
  assert.match(workflow, /\n  security:/);
  assert.match(workflow, /pnpm security:secrets/);
  assert.match(workflow, /pnpm security:deps/);
  assert.match(workflow, /security/);
  assert.match(workflow, /needs: \[.*security.*\]/);
});

test('security job has no production credentials or deployment commands', () => {
  const security = workflow.slice(workflow.indexOf('\n  security:'));
  assert.doesNotMatch(security, /DATABASE_URL(?!_TEST)/);
  assert.doesNotMatch(security, /wrangler deploy|pm2|ssh|curl .*prod/i);
});
