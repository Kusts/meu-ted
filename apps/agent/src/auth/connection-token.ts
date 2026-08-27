export type AgentConnectionClaims = {
  iss: 'pi-finance-api';
  aud: 'pi-finance-agent';
  sub: string;
  workspace: string;
  role: 'owner' | 'member';
  capabilities: string[];
  jti: string;
  iat: number;
  exp: number;
};

const encoder = new TextEncoder();

const fromBase64Url = (v: string): Uint8Array<ArrayBuffer> => {
  const base64 = v.replace(/-/g, '+').replace(/_/g, '/');
  const pad = base64.length % 4;
  const padded = pad ? base64 + '='.repeat(4 - pad) : base64;
  const binary = atob(padded);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

export const hashJti = async (jti: string): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(jti));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
};

export const verifyAgentConnectionToken = async (
  token: string,
  secret: string,
  expectedWorkspace?: string,
  nowMs = Date.now(),
): Promise<AgentConnectionClaims> => {
  if (!token || typeof token !== 'string') {
    throw new Error('invalid agent token: missing token');
  }
  if (!secret) {
    throw new Error('secret required');
  }

  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('invalid agent token: malformed format');
  }
  const [h, p, s] = parts;
  if (!h || !p || !s) {
    throw new Error('invalid agent token: empty components');
  }

  let valid = false;
  try {
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    valid = await crypto.subtle.verify(
      'HMAC',
      key,
      fromBase64Url(s),
      encoder.encode(`${h}.${p}`),
    );
  } catch {
    throw new Error('invalid agent token: signature verification failed');
  }

  if (!valid) {
    throw new Error('invalid agent token: invalid signature');
  }

  let claims: AgentConnectionClaims;
  try {
    claims = JSON.parse(new TextDecoder().decode(fromBase64Url(p))) as AgentConnectionClaims;
  } catch {
    throw new Error('invalid agent token: payload parse error');
  }

  const now = Math.floor(nowMs / 1000);

  if (claims.iss !== 'pi-finance-api') throw new Error('invalid agent token: invalid issuer');
  if (claims.aud !== 'pi-finance-agent') throw new Error('invalid agent token: invalid audience');
  if (!claims.sub || typeof claims.sub !== 'string') throw new Error('invalid agent token: missing sub');
  if (!claims.workspace || typeof claims.workspace !== 'string') throw new Error('invalid agent token: missing workspace');
  if (claims.role !== 'owner' && claims.role !== 'member') throw new Error('invalid agent token: invalid role');

  if (claims.exp <= now) throw new Error('expired agent token');
  if (claims.iat > now + 30) throw new Error('invalid agent token: future iat exceeds clock skew tolerance');
  if (claims.exp - claims.iat > 120) throw new Error('invalid agent token: ttl exceeds maximum allowed of 120s');

  if (expectedWorkspace && claims.workspace !== expectedWorkspace) {
    throw new Error(`invalid agent token: workspace mismatch (expected ${expectedWorkspace}, got ${claims.workspace})`);
  }

  return claims;
};

export const consumeAgentToken = async (
  apiBaseUrl: string,
  serviceToken: string,
  payload: {
    jti?: string;
    jtiHash?: string;
    workspaceId: string;
    actorId: string;
    connectionId?: string;
    intentionId?: string;
    expiresAt?: number;
  },
): Promise<boolean> => {
  const url = `${apiBaseUrl.replace(/\/$/, '')}/internal/agent/consume-token`;
  const jtiHash = payload.jtiHash ?? (payload.jti ? await hashJti(payload.jti) : undefined);

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-agent-service-token': serviceToken,
    },
    body: JSON.stringify({
      jtiHash,
      workspaceId: payload.workspaceId,
      actorId: payload.actorId,
      connectionId: payload.connectionId,
      intentionId: payload.intentionId,
      expiresAt: payload.expiresAt,
    }),
  });

  if (res.status === 200) {
    return true;
  }
  if (res.status === 409) {
    return false;
  }

  const text = await res.text();
  throw new Error(`Failed to consume agent token: HTTP ${res.status} ${text}`);
};
