import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const root = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const api = JSON.parse(fs.readFileSync('apps/api/package.json', 'utf8'));
const bridge = JSON.parse(fs.readFileSync('apps/whatsapp-bridge/package.json', 'utf8'));
const pwa = JSON.parse(fs.readFileSync('apps/pwa/package.json', 'utf8'));
const workspaceGate = fs.readFileSync('scripts/run-workspace-gate.mjs', 'utf8');

for (const [name, manifest] of Object.entries({ api, bridge, pwa })) {
  test(`${name} exposes lint, typecheck, test and build`, () => {
    for (const script of ['lint', 'typecheck', 'test', 'build']) {
      assert.equal(typeof manifest.scripts[script], 'string', `${name}.${script}`);
    }
  });
}

test('root gates all three apps', () => {
  for (const packageName of ['pi-finance-api', '@pi-financeiro/whatsapp-bridge', 'pwa']) {
    assert.match(workspaceGate, new RegExp(packageName.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')));
  }
  for (const script of ['lint', 'test', 'build']) {
    assert.match(root.scripts[script], /pi-finance-api/);
    assert.match(root.scripts[script], /whatsapp-bridge/);
    assert.match(root.scripts[script], /pwa/);
  }
  assert.equal(root.scripts.typecheck, 'node scripts/run-workspace-gate.mjs typecheck');
});
