import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { collectRegisteredTools, validateInventory } from './check-tool-capability-inventory.mjs';

test('registered Pi tools and inventory have one-to-one coverage', () => {
  const tools = collectRegisteredTools();
  assert.equal(tools.length, 72);
  const result = validateInventory('docs/architecture/tool-capability-inventory.md', tools);
  assert.deepEqual(result, { rows: 72, tools: 72, errors: [] });
});

test('validator rejects an unclassified newly registered capability', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'capability-inventory-'));
  try {
    const inventory = fs.readFileSync('docs/architecture/tool-capability-inventory.md', 'utf8');
    const index = fs.readFileSync('.pi/extensions/financial-tools/index.ts', 'utf8')
      .replace('  registerTool(pi, updateBudgetTool);', '  registerTool(pi, updateBudgetTool);\n  registerTool(pi, updateBudgetTool);');
    const inventoryPath = path.join(tempDir, 'inventory.md');
    const indexPath = path.join(tempDir, 'index.ts');
    fs.writeFileSync(inventoryPath, inventory);
    fs.writeFileSync(indexPath, index);
    const result = validateInventory(inventoryPath, collectRegisteredTools(indexPath));
    assert.ok(result.errors.some((error) => /registered 73 tools but inventory has 72/.test(error)));
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
