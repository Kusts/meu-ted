import { strict as assert } from 'node:assert';
import { afterEach, describe, it } from 'node:test';
import { confirmPendingOperationTool, cancelPendingOperationTool } from './generated/http-tools.js';

const originalFetch = globalThis.fetch;

const original = {
  baseUrl: process.env.PI_FINANCE_API_BASE_URL,
  deviceToken: process.env.PI_FINANCE_API_DEVICE_TOKEN,
  contextToken: process.env.PI_CONTEXT_TOKEN,
};

afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const [key, value] of Object.entries({
    PI_FINANCE_API_BASE_URL: original.baseUrl,
    PI_FINANCE_API_DEVICE_TOKEN: original.deviceToken,
    PI_CONTEXT_TOKEN: original.contextToken,
  })) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('pending write API adapters', () => {
  it('confirms through API without DATABASE_URL', async () => {
    process.env.PI_FINANCE_API_BASE_URL = 'http://api.test';
    process.env.PI_FINANCE_API_DEVICE_TOKEN = 'device-token';
    process.env.PI_CONTEXT_TOKEN = 'context-token';
    let requestUrl = '';
    globalThis.fetch = async (input, init) => {
      requestUrl = String(input);
      assert.equal(init?.method, 'POST');
      assert.equal(new Headers(init?.headers).get('x-pi-context-token'), 'context-token');
      return new Response(JSON.stringify({ status: 'approved', execution: { id: 'tx-1' } }), { status: 200 });
    };

    const result = await confirmPendingOperationTool.execute('call-1', { pendingOperationId: '11111111-1111-4111-8111-111111111111' }) as { status: string };
    assert.equal(result.status, 'approved');
    assert.equal(requestUrl, 'http://api.test/pending-operations/approve?pendingOperationId=11111111-1111-4111-8111-111111111111');
  });
  it('cancels through API using legacy chatId without DATABASE_URL', async () => {
    process.env.PI_FINANCE_API_BASE_URL = 'http://api.test';
    process.env.PI_FINANCE_API_DEVICE_TOKEN = 'device-token';
    process.env.PI_CONTEXT_TOKEN = 'context-token';
    let requestUrl = '';
    globalThis.fetch = async (input, init) => {
      requestUrl = String(input);
      assert.equal(init?.method, 'POST');
      assert.equal(new Headers(init?.headers).get('x-pi-context-token'), 'context-token');
      return new Response(JSON.stringify({ status: 'rejected' }), { status: 200 });
    };

    const result = await cancelPendingOperationTool.execute('call-2', { chatId: 'chat-1' }) as { status: string };
    assert.equal(result.status, 'rejected');
    assert.equal(requestUrl, 'http://api.test/pending-operations/reject?chatId=chat-1');
  });
});
