import { describe, expect, it, vi } from 'vitest';
import { MutationExecutor } from '../../src/mutations/mutation-executor.js';
import { FinanceChatAgent } from '../../src/finance-chat-agent.js';
import { createAgentConnectionToken } from '../../../api/src/auth/agent-connection-token.js';

describe('MutationExecutor approval decision RPC', () => {
  /** API execute response shaped like the authoritative record (mapV2). */
  const apiExecutionWithReceipt = {
    id: 'op-1',
    status: 'succeeded',
    operationId: 'op-1',
    mutationId: 'mut-1',
    execution: {
      status: 'succeeded',
      operationId: 'op-1',
      receipt: {
        mutationId: 'mut-1',
        mutationKind: 'transactions.expense.create',
        status: 'succeeded',
        affectedTargets: ['transactions', 'accounts', 'dashboard-summary', 'budgets', 'quick-insights'],
        operationId: 'op-1',
        entity: { type: 'transaction', id: 'op-1' },
      },
    },
  };
  const expectedReceipt = {
    mutationId: 'mut-1',
    mutationKind: 'transactions.expense.create',
    status: 'succeeded',
    affectedTargets: ['transactions', 'accounts', 'dashboard-summary', 'budgets', 'quick-insights'],
    operationId: 'op-1',
    entity: { type: 'transaction', id: 'op-1' },
  };

  it('executes a confirmed operation with the per-request delegated approval token and returns only the safe DTO', async () => {
    const request = vi.fn()
      .mockResolvedValueOnce({ id: 'op-1', attestation: 'a'.repeat(32) })
      .mockResolvedValueOnce({ status: 'succeeded', operationId: 'op-1', attestation: 'must-not-escape' });
    const executor = new MutationExecutor({ request });

    const result = await executor.decide({
      operationId: 'op-1',
      decision: 'confirm',
      requestId: 'req-1',
      delegatedToken: 'approval-token-1',
      identity: { workspaceId: 'ws-1', actorId: 'actor-1', deviceId: 'device-1' },
    });

    expect(result).toEqual({ operationId: 'op-1', status: 'succeeded' });
    expect(result).not.toHaveProperty('attestation');
    expect(request).toHaveBeenNthCalledWith(1, 'POST', '/pending-operations/v2/op-1/confirm', expect.objectContaining({
      delegatedToken: 'approval-token-1',
    }));
    expect(request).toHaveBeenNthCalledWith(2, 'POST', '/pending-operations/v2/op-1/execute', expect.objectContaining({
      delegatedToken: 'approval-token-1',
      body: { attestation: 'a'.repeat(32) },
    }));
  });

  it('propagates the API execution receipt and never any attestation material (executor path)', async () => {
    const request = vi.fn()
      .mockResolvedValueOnce({ id: 'op-1', attestation: 'a'.repeat(32) })
      .mockResolvedValueOnce({ ...apiExecutionWithReceipt, attestation: 'must-not-escape' });
    const executor = new MutationExecutor({ request });

    const result = await executor.decide({
      operationId: 'op-1',
      decision: 'confirm',
      requestId: 'req-receipt-1',
      delegatedToken: 'approval-token-1',
      identity: { workspaceId: 'ws-1', actorId: 'actor-1', deviceId: 'device-1' },
    });

    expect(result).toEqual({ operationId: 'op-1', status: 'succeeded', receipt: expectedReceipt });
    // INV-05: the receipt relayed to the PWA carries zero authority material.
    expect(JSON.stringify(result)).not.toContain('attestation');
    expect(JSON.stringify(result)).not.toContain('must-not-escape');
  });

  it('routes the authenticated Worker RPC and returns the receipt without attestation material', async () => {
    const secret = 'connection-secret';
    const token = await createAgentConnectionToken({ sub: 'actor-1', workspace: 'ws-1', role: 'owner', deviceId: 'device-1' }, secret);
    const agent = Object.create(FinanceChatAgent.prototype) as FinanceChatAgent;
    Object.defineProperty(agent, 'env', { value: { API_ORIGIN: 'https://api.test.local', AGENT_CONNECTION_TOKEN_SECRET: secret, AGENT_DELEGATION_SECRET: 'delegation-secret' }, configurable: true });
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'op-4', attestation: 'a'.repeat(32) }), { status: 200, headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ...apiExecutionWithReceipt, id: 'op-4', operationId: 'op-4', mutationId: 'mut-4', attestation: 'must-not-escape', execution: { ...apiExecutionWithReceipt.execution, operationId: 'op-4', receipt: { ...expectedReceipt, mutationId: 'mut-4', operationId: 'op-4', entity: { type: 'transaction', id: 'op-4' } } } }), { status: 200, headers: { 'content-type': 'application/json' } }));

    const response = await agent.fetch(new Request('https://agent.test.local/rpc/pending-operations/op-4/decision', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-agent-connection-token': token,
        'x-agent-actor': 'actor-1',
        'x-agent-workspace': 'ws-1',
        'x-agent-device': 'device-1',
      },
      body: JSON.stringify({ decision: 'confirm', requestId: 'req-4' }),
    }));

    expect(response.status).toBe(200);
    const json = (await response.json()) as { operationId?: string; status?: string; receipt?: unknown };
    expect(json.operationId).toBe('op-4');
    expect(json.status).toBe('succeeded');
    expect(json.receipt).toEqual({ ...expectedReceipt, mutationId: 'mut-4', operationId: 'op-4', entity: { type: 'transaction', id: 'op-4' } });
    expect(JSON.stringify(json)).not.toContain('attestation');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('cancels without accepting browser-supplied identity or attestation fields', async () => {
    const request = vi.fn().mockResolvedValueOnce({ id: 'op-2', executionStatus: 'cancelled' });
    const executor = new MutationExecutor({ request });

    await expect(executor.decide({
      operationId: 'op-2',
      decision: 'cancel',
      requestId: 'req-2',
      delegatedToken: 'approval-token-2',
      identity: { workspaceId: 'ws-1', actorId: 'actor-1', deviceId: 'device-1' },
    })).resolves.toEqual({ operationId: 'op-2', status: 'cancelled' });
    expect(request).toHaveBeenCalledWith('POST', '/pending-operations/v2/op-2/cancel', expect.objectContaining({ delegatedToken: 'approval-token-2' }));
  });

  it('routes the authenticated Worker RPC and never exposes approval internals to the browser', async () => {
    const secret = 'connection-secret';
    const token = await createAgentConnectionToken({ sub: 'actor-1', workspace: 'ws-1', role: 'owner', deviceId: 'device-1' }, secret);
    const agent = Object.create(FinanceChatAgent.prototype) as FinanceChatAgent;
    Object.defineProperty(agent, 'env', { value: { API_ORIGIN: 'https://api.test.local', AGENT_CONNECTION_TOKEN_SECRET: secret, AGENT_DELEGATION_SECRET: 'delegation-secret' }, configurable: true });
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'op-3', attestation: 'a'.repeat(32) }), { status: 200, headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: 'succeeded', operationId: 'op-3' }), { status: 200, headers: { 'content-type': 'application/json' } }));

    const response = await agent.fetch(new Request('https://agent.test.local/rpc/pending-operations/op-3/decision', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-agent-connection-token': token,
        'x-agent-actor': 'actor-1',
        'x-agent-workspace': 'ws-1',
        'x-agent-device': 'device-1',
      },
      body: JSON.stringify({ decision: 'confirm', requestId: 'req-3' }),
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ operationId: 'op-3', status: 'succeeded' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('fails closed when the connection token/device is absent or the browser adds fields to the strict body', async () => {
    const agent = Object.create(FinanceChatAgent.prototype) as FinanceChatAgent;
    Object.defineProperty(agent, 'env', { value: { AGENT_DELEGATION_SECRET: 'delegation-secret' }, configurable: true });
    const baseHeaders = { 'content-type': 'application/json', 'x-agent-actor': 'actor-1', 'x-agent-workspace': 'ws-1' };
    const missingDevice = await agent.fetch(new Request('https://agent.test/rpc/pending-operations/op-1/decision', { method: 'POST', headers: baseHeaders, body: JSON.stringify({ decision: 'cancel', requestId: 'req-1' }) }));
    expect(missingDevice.status).toBe(401);

    const invalidBody = await agent.fetch(new Request('https://agent.test/rpc/pending-operations/op-1/decision', {
      method: 'POST',
      headers: { ...baseHeaders, 'x-agent-device': 'device-1', 'x-agent-connection-token': 'token' },
      body: JSON.stringify({ decision: 'cancel', requestId: 'req-1', actorId: 'forged' }),
    }));
    expect(invalidBody.status).toBe(400);
  });
});
