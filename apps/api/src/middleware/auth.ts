// ─────────────────────────────────────────────────────────────────────────────
// Auth Middleware - Protects routes requiring authentication
// ─────────────────────────────────────────────────────────────────────────────

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { AuthService } from '@pi-financeiro/domain';

declare module 'fastify' {
  interface FastifyRequest {
    user?: {
      userId: string;
      householdId: string;
      sessionId: string;
    };
  }
}

export interface AuthMiddlewareOptions {
  authService: AuthService;
  publicPaths?: string[];
}

/**
 * Auth middleware plugin
 * Validates Bearer token and decorates request with user info
 */
export async function authMiddleware(
  app: FastifyInstance,
  options: AuthMiddlewareOptions
): Promise<void> {
  const { authService, publicPaths = ['/health', '/auth/seed', '/auth/request-code', '/auth/verify-code'] } = options;

  // Add hook to validate token on every request
  app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    // Skip public paths
    const path = request.url.split('?')[0];
    if (publicPaths.some(p => path.startsWith(p))) {
      return;
    }

    // Get Authorization header
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.status(401).send({ 
        success: false, 
        reason: 'Token de autenticação necessário' 
      });
    }

    const token = authHeader.slice(7); // Remove 'Bearer ' prefix

    // Validate token
    const sessionData = await authService.validateToken(token);
    if (!sessionData) {
      return reply.status(401).send({ 
        success: false, 
        reason: 'Token inválido ou revogado' 
      });
    }

    // Decorate request with user info
    request.user = {
      userId: sessionData.userId,
      householdId: sessionData.householdId,
      sessionId: sessionData.sessionId,
    };
  });
}

/**
 * Create auth middleware plugin
 */
export function createAuthMiddleware(options: AuthMiddlewareOptions) {
  return authMiddleware.bind(null, null as unknown as FastifyInstance, options);
}