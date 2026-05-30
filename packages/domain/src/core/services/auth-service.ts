// ─────────────────────────────────────────────────────────────────────────────
// Auth Service
// Handles login code generation, verification, and session management
// ─────────────────────────────────────────────────────────────────────────────

import { createHash } from 'crypto';
import {
  LOGIN_CODE_EXPIRY_MINUTES,
  MAX_LOGIN_ATTEMPTS,
  CODE_LENGTH,
} from '../entities/login-code.js';
import type { Session, SessionCreate } from '../entities/session.js';
import type { LoginCodeCreate } from '../entities/login-code.js';
import type { ISessionRepository } from '../repositories/session-repository.js';
import type { ILoginCodeRepository } from '../repositories/login-code-repository.js';
import type { IUserRepository } from '../repositories/user-repository.js';
import type { IHouseholdRepository } from '../repositories/household-repository.js';

export interface AuthServiceDeps {
  sessionRepository: ISessionRepository;
  loginCodeRepository: ILoginCodeRepository;
  userRepository: IUserRepository;
  householdRepository: IHouseholdRepository;
  sendLoginCode: (phone: string, code: string) => Promise<void>;
}

export interface GenerateCodeResult {
  success: boolean;
  reason?: string;
}

export interface VerifyCodeResult {
  success: boolean;
  reason?: string;
  session?: Session;
  token?: string;
}

export interface ValidateTokenResult {
  userId: string;
  householdId: string;
  sessionId: string;
}

/**
 * Auth Service - handles authentication flow
 * 
 * Flow:
 * 1. generateLoginCode(phone) -> sends code via WhatsApp
 * 2. verifyLoginCode(phone, code) -> creates session, returns token
 * 3. validateToken(token) -> returns session data
 * 4. revokeSession(sessionId) -> invalidates session
 */
export class AuthService {
  constructor(private deps: AuthServiceDeps) {}

  /**
   * Generate and send login code
   */
  async generateLoginCode(phone: string): Promise<GenerateCodeResult> {
    // Find user by phone
    const user = await this.deps.userRepository.findByPhone(phone);
    if (!user) {
      return { success: false, reason: 'Telefone não cadastrado' };
    }

    // Check for existing code
    const existingCode = await this.deps.loginCodeRepository.findByPhone(phone);
    
    if (existingCode) {
      // Check if expired first
      const isExpired = new Date(existingCode.expiresAt) < new Date();
      
      // If expired, allow creating new code (ignore attempts)
      if (isExpired) {
        // Will create new code below
      }
      // Check attempts only for non-expired codes
      else if (existingCode.attempts >= MAX_LOGIN_ATTEMPTS) {
        return { 
          success: false, 
          reason: 'Muitas tentativas. Tente novamente em alguns minutos.' 
        };
      }
      else {
        // Send same code again for non-expired, non-maxed attempts
        await this.deps.sendLoginCode(phone, '********');
        return { success: true };
      }
    }

    // Generate new code
    const code = generateRandomCode(CODE_LENGTH);
    const codeHash = hashCode(code);
    
    const expiresAt = new Date(Date.now() + LOGIN_CODE_EXPIRY_MINUTES * 60 * 1000).toISOString();
    
    const codeCreate: LoginCodeCreate = {
      id: phone, // Use phone as ID for simplicity
      householdId: user.householdId,
      phone,
      codeHash,
      expiresAt,
    };

    await this.deps.loginCodeRepository.create(codeCreate);
    await this.deps.sendLoginCode(phone, code);

    return { success: true };
  }

  /**
   * Verify login code and create session
   */
  async verifyLoginCode(phone: string, code: string): Promise<VerifyCodeResult> {
    // Find the code
    const storedCode = await this.deps.loginCodeRepository.findByPhone(phone);
    
    if (!storedCode) {
      return { success: false, reason: 'Código inválido ou expirado' };
    }

    // Check if expired
    if (new Date(storedCode.expiresAt) < new Date()) {
      return { success: false, reason: 'Código inválido ou expirado' };
    }

    // Verify the code
    const codeHash = hashCode(code);
    if (codeHash !== storedCode.codeHash) {
      // Increment attempts
      await this.deps.loginCodeRepository.update(phone, {
        attempts: storedCode.attempts + 1,
      });
      return { success: false, reason: 'Código incorreto' };
    }

    // Find user
    const user = await this.deps.userRepository.findByPhone(phone);
    if (!user) {
      return { success: false, reason: 'Usuário não encontrado' };
    }

    // Delete the code (one-time use)
    await this.deps.loginCodeRepository.delete(phone);

    // Generate session token
    const token = generateSessionToken();
    const tokenHash = hashCode(token);

    const sessionCreate: SessionCreate = {
      id: crypto.randomUUID(),
      householdId: user.householdId,
      userId: user.id,
      tokenHash,
    };

    const session = await this.deps.sessionRepository.create(sessionCreate);

    return {
      success: true,
      session,
      token,
    };
  }

  /**
   * Validate session token
   */
  async validateToken(token: string): Promise<ValidateTokenResult | null> {
    const tokenHash = hashCode(token);
    const session = await this.deps.sessionRepository.findByTokenHash(tokenHash);
    
    if (!session) {
      return null;
    }

    return {
      userId: session.userId,
      householdId: session.householdId,
      sessionId: session.id,
    };
  }

  /**
   * Revoke a session
   */
  async revokeSession(sessionId: string): Promise<Session | null> {
    return this.deps.sessionRepository.revoke(sessionId, {
      revokedAt: new Date().toISOString(),
    });
  }
}

/**
 * Generate random session token (UUID v4)
 */
function generateSessionToken(): string {
  return crypto.randomUUID();
}

/**
 * Generate random numeric code
 */
function generateRandomCode(length: number): string {
  let code = '';
  for (let i = 0; i < length; i++) {
    code += Math.floor(Math.random() * 10).toString();
  }
  return code;
}

/**
 * Hash code using SHA-256
 */
export function hashCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}