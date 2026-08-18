import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { describe, it } from 'node:test';

const generatedPath = '.pi/extensions/financial-tools/generated/http-tools.ts';

const generate = () =>
  execFileSync(process.execPath, ['scripts/generate-agent-tools.mjs'], { stdio: 'pipe' });

const load = async () => {
  const source = await readFile(generatedPath, 'utf8');
  const symbols = [...source.matchAll(/export const ([A-Za-z0-9]+Tool) = generatedHttpTools/g)]
    .map((match) => match[1])
    .sort();
  const names = [...source.matchAll(/"name": "([^"]+)"/g)].map((match) => match[1]).sort();
  const schemas = [...source.matchAll(/Type\.(Object|String|Integer|Number|Boolean|Array|Union|Optional)\(/g)]
    .map((match) => match[1]);
  return { source, symbols, names, schemas };
};

it('generates byte-identical output across repeated runs', async () => {
  generate();
  const first = await load();
  generate();
  const second = await load();
  assert.equal(first.source, second.source, 'repeated generation must be byte-identical');
  assert.deepEqual(first.symbols, second.symbols, 'exported tool symbols must be stable');
  assert.deepEqual(first.names, second.names, 'tool names must be stable');
  assert.deepEqual(first.schemas, second.schemas, 'schema expressions must be stable');
});
