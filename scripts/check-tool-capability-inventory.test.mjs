import assert from 'node:assert/strict';
import test from 'node:test';
import { collectRegisteredTools, validateInventory } from './check-tool-capability-inventory.mjs';

test('canonical generated tools and capability inventory remain compatible', () => {
  const tools = collectRegisteredTools();
  assert.equal(tools.length, 52);
  const result = validateInventory('docs/architecture/tool-capability-inventory.md', tools);
  assert.deepEqual(result, { rows: 72, tools: 52, errors: [] });
});

test('validator rejects an unclassified newly registered capability', () => {
  const tools = collectRegisteredTools();
  const result = validateInventory(
    'docs/architecture/tool-capability-inventory.md',
    [...tools, 'unclassified_test_tool'],
  );
  assert.ok(result.errors.some((error) => /registered 53 tools but inventory has 72/.test(error)));
});
