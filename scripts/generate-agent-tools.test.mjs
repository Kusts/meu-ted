import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { describe, it } from 'node:test';

const contractPath = 'apps/api/openapi/agent-tools.openapi.json';
const generatedPath = '.pi/extensions/financial-tools/generated/http-tools.ts';

it('keeps generated HTTP tools synchronized with the OpenAPI contract', async () => {
  execFileSync(process.execPath, ['scripts/generate-agent-tools.mjs', '--check'], { stdio: 'pipe' });
  const contract = JSON.parse(await readFile(contractPath, 'utf8'));
  const generated = await readFile(generatedPath, 'utf8');
  const operations = Object.values(contract.paths).flatMap((pathItem) => Object.values(pathItem).flatMap((operation) => [
    ...(operation['x-pi-tool'] ? [{ ...operation, operationId: operation.operationId }] : []),
    ...(operation['x-pi-tools'] ?? []),
  ]));
  assert.equal(contract['x-pi-tools'], undefined, 'tools must be represented as OpenAPI path operations');
  const inlineParameterTools = Object.values(contract.paths).flatMap((pathItem) => Object.values(pathItem)).flatMap((operation) => [operation['x-pi-tool'], ...(operation['x-pi-tools'] ?? [])]).filter((tool) => tool?.parameters);
  assert.equal(inlineParameterTools.length, 0, 'tool parameters must come from operation parameters/requestBody');
  const flags = await readFile('.pi/extensions/financial-tools/tools/capability-flags.ts', 'utf8');
  const capabilityBlock = flags.match(/migratedApiCapabilities = new Set\(\[([\s\S]*?)\]\)/)?.[1] ?? '';
  const migrated = [...capabilityBlock.matchAll(/"([a-z_]+)"/g)].map((match) => match[1]);
  const generatedSymbols = [...generated.matchAll(/export const ([A-Za-z0-9]+Tool) = generatedHttpTools/g)].map((match) => match[1]);
  const generatedNames = generatedSymbols.map((symbol) => symbol.slice(0, -4).replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`));
  assert.deepEqual(new Set(generatedNames), new Set(migrated), 'every migrated API capability must be generated');
  assert.equal(generatedNames.length, migrated.length);
  assert.match(generated, /const intentionId = typeof params\.intentionId === "string"/);
  assert.match(generated, /intentionId \?\? String\(params\.idempotencyKey \?\? toolCallId\)/);
  for (const operation of operations) {
    const operationId = operation['x-pi-tool']?.name ?? operation.operationId ?? operation.name;
      assert.match(generated, new RegExp(`"name": "${operationId}"`));
      const symbol = operationId.replace(/(^|_)([a-z])/g, (_, start, letter) => letter.toUpperCase());
      assert.match(generated, new RegExp(`export const ${symbol.charAt(0).toLowerCase()}${symbol.slice(1)}Tool`));
  }
});

describe('generated facade policy', () => {
  for (const file of ['audit_logs', 'list_accounts', 'list_categories', 'get_month_summary', 'list_recent_transactions', 'create_expense']) {
    it(`${file} contains no hand-written HTTP tool implementation`, async () => {
      const source = await readFile(`.pi/extensions/financial-tools/tools/${file}.ts`, 'utf8');
      assert.match(source, /generated\/http-tools\.js/);
      assert.doesNotMatch(source, /async execute|Type\.Object|requestPiApiJson\(/);
    });
  }

  it('has a generated facade for every migrated capability', async () => {
    const flags = await readFile('.pi/extensions/financial-tools/tools/capability-flags.ts', 'utf8');
    const capabilityBlock = flags.match(/migratedApiCapabilities = new Set\(\[([\s\S]*?)\]\)/)?.[1] ?? '';
    const migrated = [...capabilityBlock.matchAll(/"([a-z_]+)"/g)].map((match) => match[1]);
    const { readdir } = await import('node:fs/promises');
    const files = await readdir('.pi/extensions/financial-tools/tools');
    const sources = await Promise.all(files.filter((file) => file.endsWith('.ts')).map(async (file) => ({ file, source: await readFile(`.pi/extensions/financial-tools/tools/${file}`, 'utf8') })));
    for (const capability of migrated) {
      const source = sources.find(({ source }) => source.includes(`name: "${capability}"`));
      assert.ok(source, `missing facade for ${capability}`);
      assert.match(source.source, /generated\/http-tools\.js/, capability);
      assert.doesNotMatch(source.source, /async execute|Type\.Object|requestPiApiJson\(/, capability);
    }
  });
});
