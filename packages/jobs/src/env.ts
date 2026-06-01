// ─────────────────────────────────────────────────────────────────────────────
// Environment Variables - Jobs Package
// Validates DATABASE_URL at runtime, allows test mode without DB
// ─────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';

// Environment schema for jobs package
const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  NODE_ENV: z.enum(['development', 'production', 'test']).optional().default('development'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).optional().default('info'),
});

/**
 * Check if we're in test mode
 */
function isTestMode(): boolean {
  return (
    process.env.NODE_ENV === 'test' ||
    process.env.VITEST !== undefined ||
    process.env.TEST !== undefined
  );
}

/**
 * Get validated environment
 * In test mode, returns placeholder values if env vars are missing
 * In production/development, throws if validation fails
 */
function getValidatedEnv() {
  const parsed = envSchema.safeParse(process.env);

  if (parsed.success) {
    return parsed.data;
  }

  // Validation failed - check if we're in test mode
  if (isTestMode()) {
    // Return placeholder for tests
    return {
      DATABASE_URL: process.env.DATABASE_URL || 'postgres://localhost:5432/test_db',
      NODE_ENV: 'test' as const,
      LOG_LEVEL: 'error' as const,
    };
  }

  // Not in test mode - validation failed, cannot continue
  console.error('❌ Invalid environment variables:');
  console.error(parsed.error.format());
  throw new Error('Invalid environment - DATABASE_URL is required');
}

// Initialize env immediately
const _env = getValidatedEnv();

// Export singleton
export const env = _env;
export const DATABASE_URL = _env.DATABASE_URL;
export const NODE_ENV = _env.NODE_ENV;
export const LOG_LEVEL = _env.LOG_LEVEL;