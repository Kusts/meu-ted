// ─────────────────────────────────────────────────────────────────────────────
// Auth Routes
// POST /auth/seed, POST /auth/request-code, POST /auth/verify-code, POST /auth/revoke
// ─────────────────────────────────────────────────────────────────────────────

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  AuthService,
  InMemorySessionRepository,
  InMemoryLoginCodeRepository,
  InMemoryUserRepository,
  InMemoryHouseholdRepository,
} from '@pi-financeiro/domain';

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  // Code store for test access (used in tests)
  const codeStore = new Map<string, string>();
  (app as any).codeStore = codeStore;

  // Fake sender - in production would use Evolution API
  // Uses callback to allow storing code in multiple places
  async function sendLoginCode(phone: string, code: string): Promise<void> {
    // Store code for test access
    codeStore.set(phone, code);
    // In production: await evolutionClient.sendMessage(phone, `Seu código é: ${code}`);
    console.log(`[FAKE SMS] Code for ${phone}: ${code}`);
  }

  // Check if deps is available (from createApp) and use shared auth service
  const deps = (app as any).deps;
  const existingAuthService = (app as any).authService;
  
  let sessionRepo: InstanceType<typeof InMemorySessionRepository>;
  let loginCodeRepo: InstanceType<typeof InMemoryLoginCodeRepository>;
  let userRepo: InstanceType<typeof InMemoryUserRepository>;
  let householdRepo: InstanceType<typeof InMemoryHouseholdRepository>;
  let authService: AuthService;
  
  if (deps?.sessionRepository && existingAuthService) {
    // Use existing auth repos from deps (shared state with middleware)
    sessionRepo = deps.sessionRepository;
    loginCodeRepo = deps.loginCodeRepository;
    userRepo = deps.userRepository;
    householdRepo = deps.householdRepository;
    authService = existingAuthService;
  } else {
    // Create standalone auth stores for tests
    sessionRepo = new InMemorySessionRepository();
    loginCodeRepo = new InMemoryLoginCodeRepository();
    userRepo = new InMemoryUserRepository();
    householdRepo = new InMemoryHouseholdRepository();
    
    authService = new AuthService({
      sessionRepository: sessionRepo,
      loginCodeRepository: loginCodeRepo,
      userRepository: userRepo,
      householdRepository: householdRepo,
      sendLoginCode,
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // POST /auth/seed
  // Creates household and user from provided data or env vars
  // ─────────────────────────────────────────────────────────────────────────

  app.post('/auth/seed', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as Record<string, string> | undefined;
    
    const householdName = body?.householdName || process.env.SEED_HOUSEHOLD_NAME || 'Casa';
    const userName = body?.userName || process.env.SEED_USER_NAME || 'Usuário';
    const phone = body?.phone || process.env.SEED_USER_PHONE || '5511999999999';

    if (!phone) {
      return reply.status(400).send({ 
        success: false, 
        reason: 'phone é obrigatório' 
      });
    }

    // Check if user already exists
    const existingUser = await userRepo.findByPhone(phone);
    if (existingUser) {
      return reply.status(200).send({ 
        success: true, 
        householdId: existingUser.householdId,
        userId: existingUser.id,
        idempotent: true 
      });
    }

    // Create household
    const household = await householdRepo.create({
      id: crypto.randomUUID(),
      name: householdName,
      currency: 'BRL',
      timezone: 'America/Sao_Paulo',
    });

    // Create user
    const user = await userRepo.create({
      id: crypto.randomUUID(),
      householdId: household.id,
      name: userName,
      phone,
      role: 'owner',
    });

    return reply.status(201).send({
      success: true,
      householdId: household.id,
      userId: user.id,
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // POST /auth/request-code
  // Generates and sends login code via WhatsApp
  // ─────────────────────────────────────────────────────────────────────────

  app.post('/auth/request-code', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as { phone: string };
    
    if (!body.phone) {
      return reply.status(400).send({ 
        success: false, 
        reason: 'phone é obrigatório' 
      });
    }

    const result = await authService.generateLoginCode(body.phone);

    if (!result.success) {
      return reply.status(404).send({ 
        success: false, 
        reason: result.reason 
      });
    }

    return reply.status(200).send({ success: true });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // POST /auth/verify-code
  // Verifies code and returns session token
  // ─────────────────────────────────────────────────────────────────────────

  app.post('/auth/verify-code', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as { phone: string; code: string };
    
    if (!body.phone || !body.code) {
      return reply.status(400).send({ 
        success: false, 
        reason: 'phone e code são obrigatórios' 
      });
    }

    const result = await authService.verifyLoginCode(body.phone, body.code);

    if (!result.success) {
      return reply.status(401).send({ 
        success: false, 
        reason: result.reason 
      });
    }

    // Get user info
    const user = await userRepo.findByPhone(body.phone);

    return reply.status(200).send({
      success: true,
      token: result.token,
      user: user ? { id: user.id, name: user.name, phone: user.phone, householdId: user.householdId } : null,
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // POST /auth/revoke
  // Revokes current session
  // ─────────────────────────────────────────────────────────────────────────

  app.post('/auth/revoke', async (request: FastifyRequest, reply: FastifyReply) => {
    // Get user from decorated request (set by middleware)
    if (!(request as any).user) {
      return reply.status(401).send({ 
        success: false, 
        reason: 'Não autenticado' 
      });
    }

    const result = await authService.revokeSession((request as any).user.sessionId);

    if (!result) {
      return reply.status(404).send({ 
        success: false, 
        reason: 'Sessão não encontrada' 
      });
    }

    return reply.status(200).send({ success: true });
  });
}

// Re-export for test
import { createApp } from './app.js';

/**
 * Create app with auth routes for testing
 */
export async function createAuthApp() {
  const app = createApp({
    instanceToken: 'test-instance-token',
    allowedGroupIds: [],
    registeredPhones: [],
  });

  await registerAuthRoutes(app);
  return app;
}