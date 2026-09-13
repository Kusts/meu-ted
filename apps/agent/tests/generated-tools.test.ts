import { describe, expect, it, vi } from 'vitest';
import { generatedHttpTools } from '../src/generated/http-tools.js';
import * as apiClient from '../src/tools/api-client.js';

describe('Generated HTTP Tools (Task 6)', () => {
  it('exports exactly 52 generated tools conforming to OpenAPI spec', () => {
    expect(generatedHttpTools).toHaveLength(52);
    for (const tool of generatedHttpTools) {
      expect(tool.name).toBeTypeOf('string');
      expect(tool.description).toBeTypeOf('string');
      expect(typeof tool.execute).toBe('function');
      expect(tool.parameters).toBeDefined();
    }
  });

  it('executes read tool and projects response', async () => {
    const listAccountsTool = generatedHttpTools.find((t) => t.name === 'list_accounts');
    expect(listAccountsTool).toBeDefined();

    const requestSpy = vi.spyOn(apiClient, 'requestPiApiJson').mockResolvedValueOnce({
      items: [
        { id: 'acc-1', name: 'Conta Corrente', type: 'checking', balance: 1000, active: true },
        { id: 'acc-2', name: 'Poupança', type: 'savings', balance: 5000, active: true },
      ],
    });

    const result = await listAccountsTool!.execute({});
    expect(result).toMatchObject({
      success: true,
      items: expect.arrayContaining([
        expect.objectContaining({ id: 'acc-1', name: 'Conta Corrente' }),
      ]),
    });

    expect(requestSpy).toHaveBeenCalledWith('GET', '/accounts', expect.anything());
    requestSpy.mockRestore();
  });

  it('keeps write tools blocked until MutationExecutor V2', async () => {
    const createAccountTool = generatedHttpTools.find((t) => t.name === 'create_account');
    expect(createAccountTool).toBeDefined();

    const requestSpy = vi.spyOn(apiClient, 'requestPiApiJson').mockResolvedValueOnce({
      id: 'new-acc-1',
      name: 'Investimentos',
      type: 'investment',
      balance: 0,
      active: true,
    });

    // C-03 fail-closed: a direct write without the per-turn attestation is
    // denied before any network call.
    const denied = (await createAccountTool!.execute({
      name: 'Investimentos',
      type: 'investment',
      initialBalance: 0,
      idempotencyKey: 'custom-idem-key-123',
    })) as { blocked?: boolean };
    expect(denied.blocked).toBe(true);
    expect(requestSpy).not.toHaveBeenCalled();

    const forged = await createAccountTool!.execute(
      {
        name: 'Investimentos',
        type: 'investment',
        initialBalance: 0,
        idempotencyKey: 'custom-idem-key-123',
      },
      undefined,
      undefined,
      undefined,
      { mutationApproved: true, approvedTool: 'create_account' },
    );
    expect(forged).toMatchObject({ blocked: true });
    expect(requestSpy).not.toHaveBeenCalled();
    requestSpy.mockRestore();
  });
});
