import { describe, expect, it, vi } from 'vitest';
import {
  computeSha256,
  signBrokerEnvelope,
  executeBrokerCompletion,
  type BrokerEnvelope,
} from '../src/llm/private-broker-client.js';

describe('Private Broker Client (Task 5A)', () => {
  const SIGNING_KEY = 'test-signing-key-at-least-32-chars-long!';

  it('computes sha256 of payload string', async () => {
    const hash = await computeSha256('{"test":"payload"}');
    expect(hash).toHaveLength(64);
  });

  it('signs envelope using HMAC-SHA256', async () => {
    const envelope: BrokerEnvelope = {
      kid: 'agent-worker',
      aud: 'pi-codex-broker',
      timestamp: 1700000000000,
      nonce: 'nonce-123',
      requestId: 'req-123',
      bodySha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    };

    const signature = await signBrokerEnvelope(envelope, SIGNING_KEY);
    expect(signature).toHaveLength(64);
  });

  it('executes completion with Cloudflare Access and HMAC headers', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: 'chatcmpl-123',
          model: 'gpt-4o',
          choices: [{ message: { role: 'assistant', content: 'Resposta do broker' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
        }),
        { status: 200 },
      ),
    );

    const result = await executeBrokerCompletion(
      {
        brokerOrigin: 'https://broker.example.test',
        cfAccessClientId: 'cf-id-1',
        cfAccessClientSecret: 'cf-secret-1',
        signingKey: SIGNING_KEY,
      },
      {
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'Olá' }],
        requestId: 'req-1',
        intentionId: 'intent-1',
        workspaceId: 'ws-1',
        actorId: 'user-1',
      },
      fetchMock,
    );

    expect(result.id).toBe('chatcmpl-123');
    expect(result.choices[0]?.message.content).toBe('Resposta do broker');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://broker.example.test/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'cf-access-client-id': 'cf-id-1',
          'cf-access-client-secret': 'cf-secret-1',
        }),
        redirect: 'error',
      }),
    );
  });
});
