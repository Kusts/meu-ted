import { randomUUID } from 'node:crypto';
import type { ContextTokenReplayGuard } from './context-token-replay.js';

export const CONTEXT_TOKEN_HEADER = 'x-pi-context-token';

export type ContextTokenClaims = {
  channelActorId: string;
  workspaceId: string;
  chatId: string;
  providerMessageId: string;
  requestId: string;
};

type ContextTokenPayload = {
  iss: 'pi-bridge-context';
  aud: 'pi-finance-api';
  v: 1;
  sub: string;
  workspace: string;
  chatId: string;
  providerMessageId: string;
  requestId: string;
  jti: string;
  iat: number;
  exp: number;
};

const encoder = new TextEncoder();
const TTL_SECONDS = 5 * 60;

const encode = (value: unknown): string => Buffer.from(JSON.stringify(value)).toString('base64url');
const importSigningKey = (secret: string) => crypto.subtle.importKey(
  'raw',
  encoder.encode(secret),
  { name: 'HMAC', hash: 'SHA-256' },
  false,
  ['sign', 'verify'],
);

const sign = async (value: string, secret: string): Promise<string> => {
  const key = await importSigningKey(secret);
  const bytes = await crypto.subtle.sign('HMAC', key, encoder.encode(value));
  return Buffer.from(bytes).toString('base64url');
};

const assertInput = (claims: ContextTokenClaims, secret: string): void => {
  if (!secret.trim()) throw new Error('context token secret is required');
  const values = [claims.channelActorId, claims.workspaceId, claims.chatId, claims.providerMessageId, claims.requestId];
  if (values.some((value) => typeof value !== 'string' || !value.trim())) throw new Error('context token claims are invalid');
};

export const createContextToken = async (
  claims: ContextTokenClaims,
  secret: string,
  nowMs = Date.now(),
): Promise<string> => {
  assertInput(claims, secret);
  const iat = Math.floor(nowMs / 1_000);
  const payload: ContextTokenPayload = {
    iss: 'pi-bridge-context',
    aud: 'pi-finance-api',
    v: 1,
    sub: claims.channelActorId,
    workspace: claims.workspaceId,
    chatId: claims.chatId,
    providerMessageId: claims.providerMessageId,
    requestId: claims.requestId,
    jti: randomUUID(),
    iat,
    exp: iat + TTL_SECONDS,
  };
  const encodedHeader = encode({ alg: 'HS256', typ: 'JWT' });
  const encodedPayload = encode(payload);
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  return `${signingInput}.${await sign(signingInput, secret)}`;
};

export type ValidatedContextToken = ContextTokenClaims & {
  version: 1;
  issuedAt: number;
  expiresAt: number;
  jti: string;
};

export const validateContextToken = async (
  token: string,
  secret: string,
  options: { requestId?: string; providerMessageId?: string; nowMs?: number } = {},
): Promise<ValidatedContextToken> => {
  if (!secret.trim()) throw new Error('context token secret is required');
  const parts = token.split('.');
  if (parts.length !== 3 || parts.some((part) => !part)) throw new Error('context token format is invalid');

  let payload: ContextTokenPayload;
  try {
    payload = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString('utf8')) as ContextTokenPayload;
  } catch {
    throw new Error('context token payload is invalid');
  }

  const key = await importSigningKey(secret);
  const signatureValid = await crypto.subtle.verify(
    'HMAC',
    key,
    Buffer.from(parts[2]!, 'base64url'),
    encoder.encode(`${parts[0]}.${parts[1]}`),
  );
  if (!signatureValid) throw new Error('context token signature is invalid');
  if (payload.iss !== 'pi-bridge-context' || payload.aud !== 'pi-finance-api' || payload.v !== 1) throw new Error('context token claims are invalid');

  const now = Math.floor((options.nowMs ?? Date.now()) / 1_000);
  if (!Number.isInteger(payload.iat) || !Number.isInteger(payload.exp) || payload.exp <= payload.iat || payload.iat > now + 30 || payload.exp <= now || payload.exp - payload.iat > TTL_SECONDS) throw new Error('context token is expired or has invalid time claims');
  if (options.requestId !== undefined && payload.requestId !== options.requestId) throw new Error('context token request binding is invalid');
  if (options.providerMessageId !== undefined && payload.providerMessageId !== options.providerMessageId) throw new Error('context token provider binding is invalid');
  if (![payload.sub, payload.workspace, payload.chatId, payload.providerMessageId, payload.requestId, payload.jti].every((value) => typeof value === 'string' && value.trim())) throw new Error('context token claims are invalid');

  return {
    channelActorId: payload.sub,
    workspaceId: payload.workspace,
    chatId: payload.chatId,
    providerMessageId: payload.providerMessageId,
    requestId: payload.requestId,
    version: 1,
    issuedAt: payload.iat,
    expiresAt: payload.exp,
    jti: payload.jti,
  };
};

export const validateAndClaimContextToken = async (
  token: string,
  secret: string,
  replayGuard: ContextTokenReplayGuard,
  options: { requestId?: string; providerMessageId?: string; nowMs?: number } = {},
): Promise<ValidatedContextToken> => {
  const validated = await validateContextToken(token, secret, options);
  const accepted = await replayGuard.claim({
    jti: validated.jti,
    workspaceId: validated.workspaceId,
    requestId: validated.requestId,
    providerMessageId: validated.providerMessageId,
    expiresAt: new Date(validated.expiresAt * 1_000),
  });
  if (!accepted) throw new Error('context token replay detected');
  return validated;
};
