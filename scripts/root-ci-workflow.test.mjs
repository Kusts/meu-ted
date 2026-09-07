import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const workflow = fs.readFileSync('.github/workflows/ci.yml', 'utf8');

for (const job of ['api:', 'bridge:', 'pwa:', 'postgres:', 'docker:', 'write-policy:']) {
  test(`root CI declares ${job.slice(0, -1)} job`, () => {
    assert.match(workflow, new RegExp(`\\n  ${job}`));
  });
}

test('root CI runs the write policy checker', () => {
  assert.match(workflow, /pnpm write-policy:check/);
  assert.match(workflow, /node --test scripts\/check-write-policy\.test\.mjs/);
});

test('root CI runs workspace builds and tests', () => {
  assert.match(workflow, /pnpm --filter meu-ted-api build/);
  assert.match(workflow, /pnpm --filter @pi-financeiro\/whatsapp-bridge build/);
  assert.match(workflow, /pnpm --filter pwa build/);
  assert.match(workflow, /pnpm --filter meu-ted-api test/);
  assert.match(workflow, /pnpm --filter pwa test/);
});

test('root CI runs disposable Postgres without an optional skip', () => {
  assert.doesNotMatch(workflow, /if: vars\.DATABASE_URL_TEST/);
  assert.match(workflow, /DATABASE_URL_TEST: postgres:\/\/test:test@localhost/);
  assert.match(workflow, /DB_TEST_MARKER:/);
});

test('root CI builds both production containers', () => {
  assert.match(workflow, /docker build .*apps\/api\/Dockerfile/);
  assert.match(workflow, /docker build .*docker\/pi-stack\/Dockerfile/);
});
