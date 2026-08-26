import type { FastifyRequest } from 'fastify';
import { AuthError, type DeviceContext } from './device-token.js';
import type { BetterAuthSessionContext } from './better-auth.js';
import type { WorkspaceAccess } from './workspace-access.js';
import type { DelegatedTurnClaims } from './delegated-token.js';
import type { ValidatedContextToken } from './context-token.js';

export type AuthenticatedContext = {
  householdId: string;
  actorId: string;
  authUserId?: string;
  actorType: 'device' | 'user';
  deviceId: string;
  role?: WorkspaceAccess['role'];
};

declare module 'fastify' {
  interface FastifyRequest {
    /** Resolved by the unified auth preHandler for protected routes. */
    deviceContext?: DeviceContext;
    /** Raw temporary device token resolved by the unified auth preHandler. */
    deviceToken?: string;
    /** Human session resolved by Better Auth during the controlled transition. */
    betterAuthContext?: BetterAuthSessionContext;
    /** Active Better Auth membership for the selected workspace. */
    workspaceAccess?: WorkspaceAccess;
    /** Resolved scope and actor identity passed to handlers. */
    authenticatedContext?: AuthenticatedContext;
    /** Claims from the short-lived Agent-to-API turn token. */
    delegatedTurn?: DelegatedTurnClaims;
    /** Validated bridge context for chat-scoped pending compatibility. */
    contextToken?: string;
    contextClaims?: ValidatedContextToken;
  }
}

export type AuthenticatedRequest = FastifyRequest & {
  authenticatedContext: AuthenticatedContext;
  deviceToken?: string;
  delegatedTurn?: DelegatedTurnClaims;
};

export const requireAuthenticatedRequest = (request: FastifyRequest): AuthenticatedRequest => {
  if (!request.authenticatedContext) {
    throw new AuthError('Authentication context missing from request', 500, 'auth.context_missing');
  }
  return request as AuthenticatedRequest;
};

