import { randomUUID } from 'node:crypto';

const encoder = new TextEncoder();
const toBase64Url = (b: Uint8Array) => Buffer.from(b).toString('base64url');
const fromBase64Url = (v: string) => new Uint8Array(Buffer.from(v, 'base64url'));
const encodeJson = (v: unknown) => toBase64Url(encoder.encode(JSON.stringify(v)));

export type AgentConnectionClaims = {
  iss: 'pi-finance-api';
  aud: 'pi-finance-agent';
  sub: string;
  workspace: string;
  role: 'owner' | 'member';
  capabilities: string[];
  jti: string;
  /**
   * H-12: device this token was minted for (resolved server-side from the
   * presented device token at mint time — never a free client claim). The
   * Worker re-stamps it as x-agent-device and the DO + delegation boundary
   * verify the SAME value. Absent for session-only clients (read-only
   * downstream for sensitive mutations).
   */
  deviceId?: string;
  iat: number;
  exp: number;
};

const isValidDeviceId = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0 && value.trim().length <= 128 && !/[\s\x00-\x1f\x7f]/.test(value);

export const createAgentConnectionToken = async (
  input: { sub: string; workspace: string; role: 'owner' | 'member'; capabilities?: string[]; jti?: string; deviceId?: string },
  secret: string,
  nowMs = Date.now(),
): Promise<string> => {
  if (!secret) throw new Error('secret required');
  if (!input.sub || !input.workspace) throw new Error('sub and workspace are required');
  if (input.role !== 'owner' && input.role !== 'member') throw new Error('role must be owner or member');
  if (input.deviceId !== undefined && !isValidDeviceId(input.deviceId)) throw new Error('deviceId is invalid');

  const iat = Math.floor(nowMs / 1000);
  const claims: AgentConnectionClaims = {
    iss: 'pi-finance-api',
    aud: 'pi-finance-agent',
    sub: input.sub,
    workspace: input.workspace,
    role: input.role,
    capabilities: input.capabilities ?? ['financial.read', 'financial.write'],
    jti: input.jti ?? randomUUID(),
    ...(input.deviceId !== undefined ? { deviceId: input.deviceId.trim() } : {}),
    iat,
    exp: iat + 120,
  };

  const header = encodeJson({ alg: 'HS256', typ: 'JWT' });
  const payload = encodeJson(claims);
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(`${header}.${payload}`));
  return `${header}.${payload}.${toBase64Url(new Uint8Array(sig))}`;
};

export const verifyAgentConnectionToken = async (
  token: string,
  secret: string,
  expectedWorkspace?: string,
  nowMs = Date.now(),
): Promise<AgentConnectionClaims> => {
  if (!token || typeof token !== 'string') throw new Error('invalid agent token: missing token');
  if (!secret) throw new Error('secret required');

  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('invalid agent token: malformed format');
  const [h, p, s] = parts;
  if (!h || !p || !s) throw new Error('invalid agent token: empty components');

  let valid = false;
  try {
    const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    valid = await crypto.subtle.verify('HMAC', key, fromBase64Url(s), encoder.encode(`${h}.${p}`));
  } catch {
    throw new Error('invalid agent token: signature verification failed');
  }

  if (!valid) throw new Error('invalid agent token: invalid signature');

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
  if (claims.deviceId !== undefined && !isValidDeviceId(claims.deviceId)) throw new Error('invalid agent token: invalid device binding');

  if (claims.exp <= now) throw new Error('expired agent token');
  if (claims.iat > now + 30) throw new Error('invalid agent token: future iat exceeds clock skew tolerance');
  if (claims.exp - claims.iat > 120) throw new Error('invalid agent token: ttl exceeds maximum allowed of 120s');

  if (expectedWorkspace && claims.workspace !== expectedWorkspace) {
    throw new Error(`invalid agent token: workspace mismatch (expected ${expectedWorkspace}, got ${claims.workspace})`);
  }

  return claims;
};
