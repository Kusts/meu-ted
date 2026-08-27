export type BrokerClientOptions = {
  brokerOrigin: string;
  cfAccessClientId?: string;
  cfAccessClientSecret?: string;
  signingKey: string;
};

export type BrokerEnvelope = {
  kid: string;
  aud: 'pi-codex-broker';
  timestamp: number;
  nonce: string;
  requestId: string;
  bodySha256: string;
};

const encoder = new TextEncoder();

export const computeSha256 = async (str: string): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(str));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
};

export const signBrokerEnvelope = async (envelope: BrokerEnvelope, secret: string): Promise<string> => {
  const payload = `${envelope.kid}.${envelope.aud}.${envelope.timestamp}.${envelope.nonce}.${envelope.requestId}.${envelope.bodySha256}`;
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
};

export const executeBrokerCompletion = async (
  options: BrokerClientOptions,
  payload: {
    model: string;
    messages: Array<{ role: string; content: string }>;
    requestId: string;
    intentionId: string;
    workspaceId: string;
    actorId: string;
  },
  customFetch = fetch,
): Promise<{
  id: string;
  model: string;
  choices: Array<{ message: { role: string; content: string }; finish_reason: string }>;
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}> => {
  const rawBody = JSON.stringify(payload);
  const bodySha256 = await computeSha256(rawBody);

  const envelope: BrokerEnvelope = {
    kid: 'agent-worker',
    aud: 'pi-codex-broker',
    timestamp: Date.now(),
    nonce: `nonce-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    requestId: payload.requestId,
    bodySha256,
  };

  const signature = await signBrokerEnvelope(envelope, options.signingKey);

  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-codex-envelope': JSON.stringify(envelope),
    'x-codex-signature': signature,
  };

  if (options.cfAccessClientId) {
    headers['cf-access-client-id'] = options.cfAccessClientId;
  }
  if (options.cfAccessClientSecret) {
    headers['cf-access-client-secret'] = options.cfAccessClientSecret;
  }

  const url = `${options.brokerOrigin.replace(/\/$/, '')}/v1/chat/completions`;
  const res = await customFetch(url, {
    method: 'POST',
    headers,
    body: rawBody,
    redirect: 'error',
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Codex Broker error HTTP ${res.status}: ${errText}`);
  }

  return (await res.json()) as {
    id: string;
    model: string;
    choices: Array<{ message: { role: string; content: string }; finish_reason: string }>;
    usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  };
};
