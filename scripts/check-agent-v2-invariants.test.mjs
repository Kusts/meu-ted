import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkInvariants } from './check-agent-v2-invariants.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const fixtures = (name) => path.join(ROOT, '__fixtures__', 'agent-v2-invariants', name);

test('accepts a compliant V2 production fixture', () => {
  const result = checkInvariants(fixtures('compliant'));
  assert.deepEqual(result.diagnostics, []);
});

test('reports each architectural invariant violation with stable codes', () => {
  const result = checkInvariants(fixtures('violations'));
  assert.deepEqual(new Set(result.diagnostics.map((item) => item.code)), new Set([
    'A2_EXEC_ACTION',
    'A3_DIRECT_NAMESPACE',
    'A4_WRITE_CAPABILITY_OUTSIDE_EXECUTOR',
    'A5_MUTATION_ISSUER_OUTSIDE_EXECUTOR',
    'A6_BINDING_MANIFEST_INCOMPLETE',
    'A7_PWA_DIRECT_PENDING_OPERATION',
    'A8_PWA_ATTESTATION_EXPOSURE',
  ]));
});

test('excludes docs, tests, fixtures and generated files from production scan', () => {
  const result = checkInvariants(fixtures('excluded'));
  assert.deepEqual(result.diagnostics, []);
});
