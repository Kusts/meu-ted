import assert from 'node:assert/strict';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { before, describe, it } from 'node:test';

const contractPath = 'apps/api/openapi/agent-tools.openapi.json';

const runGeneration = async (contract, mutate) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'p1-auth-'));
  try {
    const mutated = structuredClone(contract);
    mutate(mutated);
    const contractFile = path.join(dir, 'contract.json');
    const outFile = path.join(dir, 'out.ts');
    await writeFile(contractFile, JSON.stringify(mutated));
    let aborted = false;
    let stderr = '';
    try {
      execFileSync(process.execPath, [
        'scripts/generate-agent-tools.mjs',
        '--contract',
        contractFile,
        '--out',
        outFile,
      ], { stdio: 'pipe' });
    } catch (error) {
      aborted = true;
      stderr = String(error.stderr ?? error);
    }
    let outExists = true;
    try {
      await access(outFile);
    } catch {
      outExists = false;
    }
    return { aborted, stderr, outExists };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
};

const findOperation = (contract, predicate) => {
  for (const [routePath, pathItem] of Object.entries(contract.paths ?? {})) {
    for (const [method, operation] of Object.entries(pathItem)) {
      if (!['get', 'post', 'patch', 'put', 'delete'].includes(method)) continue;
      if (predicate(routePath, method, operation)) return { routePath, method, operation };
    }
  }
  throw new Error('no matching operation found');
};

describe('authoritative generation errors', () => {
  let contract;
  before(async () => {
    contract = JSON.parse(await readFile(contractPath, 'utf8'));
  });

  it('aborts on duplicate tool name without writing partial output', async () => {
    const { aborted, outExists, stderr } = await runGeneration(contract, (doc) => {
      const { operation } = findOperation(doc, (_p, _m, op) => Boolean(op['x-pi-tool']));
      const tool = operation['x-pi-tool'];
      operation['x-pi-tools'] = [...(operation['x-pi-tools'] ?? []), { ...tool }];
    });
    assert.equal(aborted, true, `generation must abort on duplicate tool name (${stderr})`);
    assert.equal(outExists, false, 'no partial adapter may be written');
  });

  it('aborts when a path parameter is not declared in operation parameters', async () => {
    const { aborted, outExists, stderr } = await runGeneration(contract, (doc) => {
      const { operation, routePath } = findOperation(doc, (p, _m, op) => /\{[^}]+\}/.test(p) && Boolean(op['x-pi-tool']));
      const params = [...routePath.matchAll(/\{([^}]+)\}/g)].map((match) => match[1]);
      operation.parameters = (operation.parameters ?? []).filter((parameter) => parameter.in !== 'path' || !params.includes(parameter.name));
      const tool = operation['x-pi-tool'];
      if (operation['x-pi-tools']) for (const t of operation['x-pi-tools']) t.idempotency = true;
      if (tool) tool.idempotency = true;
    });
    assert.equal(aborted, true, `generation must abort on missing path parameter (${stderr})`);
    assert.equal(outExists, false, 'no partial adapter may be written');
  });

  it('aborts when a write operation lacks idempotency metadata', async () => {
    const { aborted, outExists, stderr } = await runGeneration(contract, (doc) => {
      const { operation, routePath } = findOperation(doc, (p, m, op) => m !== 'get' && Boolean(op['x-pi-tool'] ?? op['x-pi-tools']?.[0]));
      const tool = operation['x-pi-tool'] ?? operation['x-pi-tools'][0];
      delete tool.idempotency;
      if (routePath && operation['x-pi-tools']) for (const t of operation['x-pi-tools']) delete t.idempotency;
      if (routePath && operation['x-pi-tool']) delete operation['x-pi-tool'].idempotency;
    });
    assert.equal(aborted, true, `generation must abort on write without idempotency (${stderr})`);
    assert.equal(outExists, false, 'no partial adapter may be written');
  });

  it('aborts when a declared 2xx response has no JSON schema', async () => {
    const { aborted, outExists, stderr } = await runGeneration(contract, (doc) => {
      const { operation } = findOperation(doc, (_p, _m, op) => Boolean(op['x-pi-tool']));
      operation.responses = { '200': { description: 'ok' } };
    });
    assert.equal(aborted, true, `generation must abort on response without schema (${stderr})`);
    assert.equal(outExists, false, 'no partial adapter may be written');
  });
});
