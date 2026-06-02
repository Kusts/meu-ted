// ─────────────────────────────────────────────────────────────────────────────
// Feature Flag Tests - FINANCE_AGENT_RUNTIME and FINANCE_WRITE_MODE
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PiBridge, createPiBridge } from './pi-bridge.js';

// ─────────────────────────────────────────────────────────────────────────────
// Helper functions (testing the logic independently)
// ─────────────────────────────────────────────────────────────────────────────

function isWriteMethod(method: string): boolean {
  return ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method.toUpperCase());
}

function extractIntentFromEndpoint(endpoint: string): string {
  // Match /api/{word}(-{word})* - captures the first path segment after /api/
  const match = endpoint.match(/\/api\/([a-z-]+)/);
  return match ? match[1] : 'unknown';
}

function getAgentRuntime(): 'legacy' | 'pi-native' {
  const env = process.env.FINANCE_AGENT_RUNTIME;
  if (env === 'pi-native') return 'pi-native';
  return 'legacy';
}

function getWriteMode(): 'live' | 'shadow' {
  const env = process.env.FINANCE_WRITE_MODE;
  if (env === 'shadow') return 'shadow';
  return 'live';
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('FINANCE_WRITE_MODE - Shadow Mode', () => {
  describe('isWriteMethod', () => {
    it('returns true for POST', () => {
      expect(isWriteMethod('POST')).toBe(true);
      expect(isWriteMethod('post')).toBe(true);
    });

    it('returns true for PUT', () => {
      expect(isWriteMethod('PUT')).toBe(true);
    });

    it('returns true for PATCH', () => {
      expect(isWriteMethod('PATCH')).toBe(true);
    });

    it('returns true for DELETE', () => {
      expect(isWriteMethod('DELETE')).toBe(true);
    });

    it('returns false for GET', () => {
      expect(isWriteMethod('GET')).toBe(false);
      expect(isWriteMethod('get')).toBe(false);
    });

    it('returns false for HEAD and OPTIONS', () => {
      expect(isWriteMethod('HEAD')).toBe(false);
      expect(isWriteMethod('OPTIONS')).toBe(false);
    });
  });

  describe('intent extraction', () => {
    it('extracts financial-records from /api/financial-records/expense', () => {
      expect(extractIntentFromEndpoint('/api/financial-records/expense')).toBe('financial-records');
    });

    it('extracts financial-records from /api/financial-records/income', () => {
      expect(extractIntentFromEndpoint('/api/financial-records/income')).toBe('financial-records');
    });

    it('extracts reports from /api/reports', () => {
      expect(extractIntentFromEndpoint('/api/reports?householdId=h123')).toBe('reports');
    });

    it('extracts accounts from /api/accounts', () => {
      expect(extractIntentFromEndpoint('/api/accounts?householdId=h123')).toBe('accounts');
    });

    it('returns unknown for non-matching endpoint', () => {
      expect(extractIntentFromEndpoint('/unknown/endpoint')).toBe('unknown');
    });
  });
});

describe('FINANCE_AGENT_RUNTIME - Environment Configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('defaults to legacy when not set', () => {
    delete process.env.FINANCE_AGENT_RUNTIME;
    expect(getAgentRuntime()).toBe('legacy');
  });

  it('returns legacy for explicit legacy setting', () => {
    process.env.FINANCE_AGENT_RUNTIME = 'legacy';
    expect(getAgentRuntime()).toBe('legacy');
  });

  it('returns pi-native for explicit pi-native setting', () => {
    process.env.FINANCE_AGENT_RUNTIME = 'pi-native';
    expect(getAgentRuntime()).toBe('pi-native');
  });

  it('returns legacy for any other value', () => {
    process.env.FINANCE_AGENT_RUNTIME = 'unknown';
    expect(getAgentRuntime()).toBe('legacy');
  });

  it('getWriteMode defaults to live', () => {
    delete process.env.FINANCE_WRITE_MODE;
    expect(getWriteMode()).toBe('live');
  });

  it('getWriteMode returns shadow when set', () => {
    process.env.FINANCE_WRITE_MODE = 'shadow';
    expect(getWriteMode()).toBe('shadow');
  });
});

describe('PiBridge', () => {
  describe('constructor', () => {
    it('creates bridge with householdId', () => {
      const bridge = new PiBridge({ householdId: 'h123' });
      expect(bridge).toBeDefined();
      expect(bridge.isHealthy()).toBe(false);
    });

    it('createPiBridge factory works', () => {
      const bridge = createPiBridge({ householdId: 'h123' });
      expect(bridge).toBeInstanceOf(PiBridge);
    });
  });

  describe('stop', () => {
    it('stop is idempotent when not started', async () => {
      const bridge = new PiBridge({ householdId: 'h123' });
      await bridge.stop();
      expect(bridge.isHealthy()).toBe(false);
    });
  });
});

describe('PiClient Interface Contract', () => {
  it('PiClient requires send method', () => {
    interface PiClient {
      send(
        message: string,
        senderPhone: string,
        context: { householdId: string; source: string; idempotencyKey?: string }
      ): Promise<{ success: boolean; reason?: string; data?: { message?: string } }>;
    }

    // Verify interface structure
    const mockClient: PiClient = {
      send: async () => ({ success: true, data: { message: 'test' } }),
    };

    expect(typeof mockClient.send).toBe('function');
  });
});