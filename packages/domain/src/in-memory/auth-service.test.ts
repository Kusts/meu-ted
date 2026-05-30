// ─────────────────────────────────────────────────────────────────────────────
// Auth Service tests
// ─────────────────────────────────────────────────────────────────────────────

import { describe, expect, test, vi, beforeEach } from 'vitest';
import { AuthService, hashCode } from '../core/services/auth-service.js';
import type { Session } from '../core/entities/session.js';
import type { LoginCode } from '../core/entities/login-code.js';

describe('AuthService', () => {
  let sessionRepo: {
    create: ReturnType<typeof vi.fn>;
    findByTokenHash: ReturnType<typeof vi.fn>;
    findByUserIdAndHousehold: ReturnType<typeof vi.fn>;
    revoke: ReturnType<typeof vi.fn>;
  };
  let loginCodeRepo: {
    create: ReturnType<typeof vi.fn>;
    findByPhone: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
  let userRepo: {
    findByPhone: ReturnType<typeof vi.fn>;
  };
  let householdRepo: {
    findById: ReturnType<typeof vi.fn>;
  };
  let codeSender: ReturnType<typeof vi.fn>;
  let authService: AuthService;

  beforeEach(() => {
    sessionRepo = {
      create: vi.fn(),
      findByTokenHash: vi.fn(),
      findByUserIdAndHousehold: vi.fn(),
      revoke: vi.fn(),
    };
    loginCodeRepo = {
      create: vi.fn(),
      findByPhone: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    };
    userRepo = {
      findByPhone: vi.fn(),
    };
    householdRepo = {
      findById: vi.fn(),
    };
    codeSender = vi.fn();

    authService = new AuthService({
      sessionRepository: sessionRepo as any,
      loginCodeRepository: loginCodeRepo as any,
      userRepository: userRepo as any,
      householdRepository: householdRepo as any,
      sendLoginCode: codeSender as any,
    });
  });

  describe('generateLoginCode', () => {
    test('returns error when phone not registered', async () => {
      userRepo.findByPhone.mockResolvedValue(null);

      const result = await authService.generateLoginCode('5511999999999');

      expect(result.success).toBe(false);
      expect(result.reason).toBe('Telefone não cadastrado');
    });

    test('creates code and sends it when user exists', async () => {
      const user = { id: 'user-1', householdId: 'hh-1', phone: '5511999999999' };
      userRepo.findByPhone.mockResolvedValue(user as any);
      loginCodeRepo.create.mockResolvedValue({} as LoginCode);
      codeSender.mockResolvedValue(undefined);

      const result = await authService.generateLoginCode('5511999999999');

      expect(result.success).toBe(true);
      expect(codeSender).toHaveBeenCalledWith('5511999999999', expect.any(String));
    });

    test('rate limits after max attempts', async () => {
      const user = { id: 'user-1', householdId: 'hh-1', phone: '5511999999999' };
      userRepo.findByPhone.mockResolvedValue(user as any);
      
      // Simulate max attempts
      const existingCode = {
        id: 'code-1',
        phone: '5511999999999',
        householdId: 'hh-1',
        codeHash: 'hash',
        attempts: 5,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 600000).toISOString(),
      };
      loginCodeRepo.findByPhone.mockResolvedValue(existingCode as LoginCode);

      const result = await authService.generateLoginCode('5511999999999');

      expect(result.success).toBe(false);
      expect(result.reason).toBe('Muitas tentativas. Tente novamente em alguns minutos.');
    });

    test('generates new code if expired', async () => {
      const user = { id: 'user-1', householdId: 'hh-1', phone: '5511999999999' };
      userRepo.findByPhone.mockResolvedValue(user as any);
      
      // Expired code
      const expiredCode = {
        id: 'code-1',
        phone: '5511999999999',
        householdId: 'hh-1',
        codeHash: 'old-hash',
        attempts: 5,
        createdAt: new Date(Date.now() - 600000).toISOString(),
        expiresAt: new Date(Date.now() - 300000).toISOString(),
      };
      loginCodeRepo.findByPhone.mockResolvedValue(expiredCode as LoginCode);
      loginCodeRepo.create.mockResolvedValue({} as LoginCode);
      codeSender.mockResolvedValue(undefined);

      const result = await authService.generateLoginCode('5511999999999');

      expect(result.success).toBe(true);
      expect(loginCodeRepo.create).toHaveBeenCalled();
    });
  });

  describe('verifyLoginCode', () => {
    test('returns error when code not found', async () => {
      loginCodeRepo.findByPhone.mockResolvedValue(null);

      const result = await authService.verifyLoginCode('5511999999999', '123456');

      expect(result.success).toBe(false);
      expect(result.reason).toBe('Código inválido ou expirado');
    });

    test('returns error when code expired', async () => {
      const expiredCode = {
        id: 'code-1',
        phone: '5511999999999',
        householdId: 'hh-1',
        codeHash: 'hash',
        attempts: 0,
        createdAt: new Date(Date.now() - 600000).toISOString(),
        expiresAt: new Date(Date.now() - 300000).toISOString(),
      };
      loginCodeRepo.findByPhone.mockResolvedValue(expiredCode as LoginCode);

      const result = await authService.verifyLoginCode('5511999999999', '123456');

      expect(result.success).toBe(false);
      expect(result.reason).toBe('Código inválido ou expirado');
    });

    test('increments attempts on wrong code', async () => {
      const user = { id: 'user-1', householdId: 'hh-1', phone: '5511999999999' };
      const code = {
        id: 'code-1',
        phone: '5511999999999',
        householdId: 'hh-1',
        codeHash: hashCode('654321'), // Wrong code stored
        attempts: 0,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 600000).toISOString(),
      };
      userRepo.findByPhone.mockResolvedValue(user as any);
      loginCodeRepo.findByPhone.mockResolvedValue(code as LoginCode);
      loginCodeRepo.update.mockResolvedValue({ ...code, attempts: 1 } as LoginCode);

      const result = await authService.verifyLoginCode('5511999999999', '123456');

      expect(result.success).toBe(false);
      expect(result.reason).toBe('Código incorreto');
      expect(loginCodeRepo.update).toHaveBeenCalledWith('5511999999999', { attempts: 1 });
    });

    test('creates session on correct code', async () => {
      const user = { id: 'user-1', householdId: 'hh-1', phone: '5511999999999' };
      const code = {
        id: 'code-1',
        phone: '5511999999999',
        householdId: 'hh-1',
        codeHash: hashCode('123456'),
        attempts: 0,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 600000).toISOString(),
      };
      userRepo.findByPhone.mockResolvedValue(user as any);
      loginCodeRepo.findByPhone.mockResolvedValue(code as LoginCode);
      
      const createdSession = { 
        id: 'sess-1', 
        userId: 'user-1', 
        householdId: 'hh-1',
        tokenHash: 'token-hash',
        createdAt: 'now',
        revokedAt: null,
      };
      sessionRepo.create.mockResolvedValue(createdSession as Session);
      loginCodeRepo.delete.mockResolvedValue(undefined);

      const result = await authService.verifyLoginCode('5511999999999', '123456');

      expect(result.success).toBe(true);
      expect(result.session).toBeDefined();
      expect(result.token).toBeDefined();
      expect(loginCodeRepo.delete).toHaveBeenCalledWith('5511999999999');
    });
  });

  describe('validateToken', () => {
    test('returns null for invalid token', async () => {
      sessionRepo.findByTokenHash.mockResolvedValue(null);

      const result = await authService.validateToken('invalid-token');

      expect(result).toBeNull();
    });

    test('returns session data for valid token', async () => {
      const session = { 
        id: 'sess-1', 
        userId: 'user-1', 
        householdId: 'hh-1', 
        tokenHash: 'hash',
        createdAt: 'now',
        revokedAt: null,
        userAgent: undefined,
        ipAddress: undefined,
      };
      sessionRepo.findByTokenHash.mockResolvedValue(session as Session);

      const result = await authService.validateToken('valid-token');

      expect(result).not.toBeNull();
      expect(result?.userId).toBe('user-1');
      expect(result?.householdId).toBe('hh-1');
      expect(result?.sessionId).toBe('sess-1');
    });
  });

  describe('revokeSession', () => {
    test('revokes session successfully', async () => {
      const session = { id: 'sess-1', userId: 'user-1', householdId: 'hh-1' };
      const revoked = { ...session, revokedAt: new Date().toISOString() };
      sessionRepo.revoke.mockResolvedValue(revoked as Session);

      const result = await authService.revokeSession('sess-1');

      expect(result).toEqual(revoked);
    });
  });

  describe('hashCode', () => {
    test('generates consistent hash', () => {
      const code = '123456';
      const hash1 = hashCode(code);
      const hash2 = hashCode(code);
      
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA-256 hex is 64 chars
    });

    test('different codes produce different hashes', () => {
      const hash1 = hashCode('123456');
      const hash2 = hashCode('654321');
      
      expect(hash1).not.toBe(hash2);
    });
  });
});