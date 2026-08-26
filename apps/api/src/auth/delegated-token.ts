import { randomUUID } from 'node:crypto';

export type DelegatedRole = 'owner' | 'member';
export type DelegatedTurnClaims = {
  iss: 'pi-agent'; aud: 'pi-finance-api'; sub: string; workspace: string; role: DelegatedRole;
  capabilities: string[]; jti: string; request: string; iat: number; exp: number;
};
export type DelegatedTurnInput = { actorId: string; workspaceId: string; role: DelegatedRole; capabilities: string[]; requestId: string };

const encoder = new TextEncoder();
const toBase64Url = (bytes: Uint8Array): string => Buffer.from(bytes).toString('base64url');
const fromBase64Url = (value: string): Uint8Array => new Uint8Array(Buffer.from(value, 'base64url'));
const encodeJson = (value: unknown): string => toBase64Url(encoder.encode(JSON.stringify(value)));
const importKey = (secret: string) => crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);

export const createDelegatedTurnToken = async (input: DelegatedTurnInput, secret: string, nowMs = Date.now()): Promise<string> => {
  if (!secret) throw new Error('delegation secret is required');
  if (!input.actorId || !input.workspaceId || !input.requestId || !['owner', 'member'].includes(input.role) || input.capabilities.length === 0 || input.capabilities.some((capability) => typeof capability !== 'string' || capability.length === 0)) throw new Error('delegation claims are invalid');
  const iat = Math.floor(nowMs / 1_000);
  const header = encodeJson({ alg: 'HS256', typ: 'JWT' });
  const payload = encodeJson({ iss: 'pi-agent', aud: 'pi-finance-api', sub: input.actorId, workspace: input.workspaceId, role: input.role, capabilities: input.capabilities, jti: randomUUID(), request: input.requestId, iat, exp: iat + 300 });
  const signature = await crypto.subtle.sign('HMAC', await importKey(secret), encoder.encode(`${header}.${payload}`));
  return `${header}.${payload}.${toBase64Url(new Uint8Array(signature))}`;
};

export const createDelegatedTokenForTest = createDelegatedTurnToken;


export const verifyDelegatedTurnToken = async (token: string, secret: string, nowMs = Date.now()): Promise<DelegatedTurnClaims> => {
  try {
    const [encodedHeader, encodedPayload, encodedSignature] = token.split('.');
    if (!encodedHeader || !encodedPayload || !encodedSignature || !secret) throw new Error();
    const header = JSON.parse(new TextDecoder().decode(fromBase64Url(encodedHeader))) as { alg?: string; typ?: string };
    if (header.alg !== 'HS256' || header.typ !== 'JWT') throw new Error();
    const valid = await crypto.subtle.verify('HMAC', await importKey(secret), fromBase64Url(encodedSignature), encoder.encode(`${encodedHeader}.${encodedPayload}`));
    if (!valid) throw new Error();
    const claims = JSON.parse(new TextDecoder().decode(fromBase64Url(encodedPayload))) as DelegatedTurnClaims;
    const now = Math.floor(nowMs / 1_000);
    if (claims.exp <= now) throw new Error('expired delegated token');
    if (typeof claims.iss !== 'string' || typeof claims.aud !== 'string' || typeof claims.sub !== 'string' || typeof claims.workspace !== 'string' || typeof claims.role !== 'string' || typeof claims.jti !== 'string' || typeof claims.request !== 'string' || !Number.isInteger(claims.iat) || !Number.isInteger(claims.exp) || claims.iss !== 'pi-agent' || claims.aud !== 'pi-finance-api' || !claims.sub || !claims.workspace || !claims.jti || !claims.request || !Array.isArray(claims.capabilities) || claims.capabilities.length === 0 || claims.capabilities.some((value) => typeof value !== 'string' || value.length === 0) || !['owner', 'member'].includes(claims.role) || claims.exp <= claims.iat || claims.exp - claims.iat > 300 || claims.iat > now + 30) throw new Error();
    return claims;
  } catch (cause) {
    if (cause instanceof Error && cause.message === 'expired delegated token') throw cause;
    throw new Error('invalid delegated token');
  }
};
