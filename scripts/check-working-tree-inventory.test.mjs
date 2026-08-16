import test from 'node:test';
import assert from 'node:assert/strict';
import {
  VALID_ACTIONS,
  VALID_CLASSES,
  buildInventory,
  collectWorkingTreePaths,
  validateInventory,
  writeInventoryDocument,
} from './check-working-tree-inventory.mjs';

test('real working tree inventory is complete, valid, and secret-safe', () => {
  const paths = collectWorkingTreePaths();
  const inventory = buildInventory(paths);
  const summary = validateInventory(inventory);
  writeInventoryDocument(inventory);
  assert.ok(paths.length > 0, 'the working tree must have paths to inventory');
  assert.equal(summary.count, paths.length);
  assert.equal(new Set(inventory.map((entry) => entry.path)).size, inventory.length);

  for (const entry of inventory) {
    assert.ok(VALID_CLASSES.includes(entry.class));
    assert.match(entry.owner, /^P[0-5]$/);
    assert.ok(VALID_ACTIONS.includes(entry.action));
    assert.ok(entry.rationale.trim().length > 0);
  }

  assert.doesNotMatch(
    JSON.stringify(inventory),
    /(password|passwd|token|secret|cookie|private[_ -]?key|database[_ -]?url)\s*[:=]/i,
  );
});

test('rejects an entry without an owner', () => {
  assert.throws(
    () => validateInventory([
      { path: 'example.txt', class: 'project-wip', owner: '', action: 'preserve', rationale: 'wip' },
    ]),
    /owner/i,
  );
});

test('rejects an invalid class or action', () => {
  assert.throws(
    () => validateInventory([
      { path: 'example.txt', class: 'not-a-class', owner: 'P0', action: 'preserve', rationale: 'wip' },
    ]),
    /class/i,
  );
  assert.throws(
    () => validateInventory([
      { path: 'example.txt', class: 'project-wip', owner: 'P0', action: 'not-an-action', rationale: 'wip' },
    ]),
    /action/i,
  );
});

test('rejects duplicate paths', () => {
  assert.throws(
    () => validateInventory([
      { path: 'example.txt', class: 'project-wip', owner: 'P0', action: 'preserve', rationale: 'wip' },
      { path: 'example.txt', class: 'project-wip', owner: 'P0', action: 'preserve', rationale: 'same path' },
    ]),
    /duplic/i,
  );
});
