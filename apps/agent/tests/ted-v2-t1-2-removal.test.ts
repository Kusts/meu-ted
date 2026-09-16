import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { checkToolExecutionPolicy } from '../src/tools/api-tool-helpers.js';

const source = async (file: string): Promise<string> =>
  readFile(new URL(`../src/${file}`, import.meta.url), 'utf8');

describe('TED V2 T1.2 removal invariants', () => {
  it('does not retain a model marker parser or execution path', async () => {
    const agent = await source('finance-chat-agent.ts');
    expect(agent).not.toContain('[EXEC_ACTION');
    expect(agent).not.toMatch(/actionMatch|toolToExec|JSON\.parse\(actionMatch/);
  });

  it('does not create or grant a financial.write delegated capability', async () => {
    const [agent, index] = await Promise.all([source('finance-chat-agent.ts'), source('index.ts')]);
    expect(`${agent}\n${index}`).not.toContain('financial.write');
  });

  it('does not expose legacy HTTP process or retry execution paths', async () => {
    const [authBoundary, gateway] = await Promise.all([source('index.ts'), source('worker.ts')]);
    // T4.3 (SPEC section 11 E4): the retired 410 stubs left with the routes
    // themselves — the paths are gone, not stubbed. Neither the execution
    // paths nor the stub markers may remain.
    expect(authBoundary).not.toContain('agent.legacy_mutation_path_removed');
    expect(gateway).not.toContain('agent.legacy_mutation_path_removed');
    expect(authBoundary).not.toContain('processTurn');
    expect(authBoundary).not.toContain('retryTurn');
    expect(gateway).not.toContain('processTurn');
    expect(gateway).not.toContain('retryTurn');
  });

  it('rejects every write call, including a forged legacy approval object', () => {
    expect(checkToolExecutionPolicy('create_expense', 'write', {
      mutationApproved: true,
      approvedTool: 'create_expense',
    })).toMatchObject({ blocked: true });
  });
});
