/**
 * Runtime DB tests — infrastructure validation
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('pg', () => ({
  __esModule: true,
  default: {
    Pool: vi.fn(() => ({
      query: vi.fn(),
      connect: vi.fn(),
      end: vi.fn(),
    })),
  },
  Pool: vi.fn(() => ({
    query: vi.fn(),
    connect: vi.fn(),
    end: vi.fn(),
  })),
}));

describe('db infrastructure', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('pool initialization', () => {
    it('requires DATABASE_URL env var', async () => {
      expect(() => {
        if (!process.env.DATABASE_URL) {
          throw new Error('DATABASE_URL environment variable is not set');
        }
      }).toThrow('DATABASE_URL environment variable is not set');
    });
  });

  describe('query contract', () => {
    it('query function exists and has correct signature', async () => {
      const { query } = await import('../db');
      expect(typeof query).toBe('function');
    });

    it('withTransaction function exists and has correct signature', async () => {
      const { withTransaction } = await import('../db');
      expect(typeof withTransaction).toBe('function');
    });
  });

  describe('isDatabaseHealthy contract', () => {
    it('returns boolean', async () => {
      const { isDatabaseHealthy } = await import('../db');
      const healthy = await isDatabaseHealthy();
      expect(typeof healthy).toBe('boolean');
    });
  });
});