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

  it('executes write tool with idempotency key forwarding', async () => {
    const createAccountTool = generatedHttpTools.find((t) => t.name === 'create_account');
    expect(createAccountTool).toBeDefined();

    const requestSpy = vi.spyOn(apiClient, 'requestPiApiJson').mockResolvedValueOnce({
      id: 'new-acc-1',
      name: 'Investimentos',
      type: 'investment',
      balance: 0,
      active: true,
    });

    const result = await createAccountTool!.execute({
      name: 'Investimentos',
      type: 'investment',
      initialBalance: 0,
      idempotencyKey: 'custom-idem-key-123',
    });

    expect(result).toMatchObject({
      success: true,
      id: 'new-acc-1',
    });

    expect(requestSpy).toHaveBeenCalledWith(
      'POST',
      '/accounts',
      expect.objectContaining({
        idempotencyKey: 'custom-idem-key-123',
        body: expect.objectContaining({ name: 'Investimentos' }),
      }),
    );
    requestSpy.mockRestore();
  });
});
