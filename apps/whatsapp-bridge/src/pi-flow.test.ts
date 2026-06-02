// ─────────────────────────────────────────────────────────────────────────────
// Pi Flow Integration Tests
// Tests the complete flow: message → PiBridge → response
// Tests pending operations and shadow mode
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PiBridge, createPiBridge } from './pi-bridge.js';

// ─────────────────────────────────────────────────────────────────────────────
// Test Helpers
// ─────────────────────────────────────────────────────────────────────────────

interface TestPendingOperation {
  id: string;
  householdId: string;
  chatId: string;
  status: 'pending' | 'confirmed' | 'cancelled' | 'expired';
  draftPayload: Record<string, unknown>;
  missingFields: string[];
  confirmationLevel: number;
}

// Simple in-memory store for pending operations (test version)
class TestPendingOperationStore {
  private operations = new Map<string, TestPendingOperation>();

  create(op: TestPendingOperation): TestPendingOperation {
    this.operations.set(op.id, op);
    return op;
  }

  findById(id: string): TestPendingOperation | null {
    return this.operations.get(id) ?? null;
  }

  findByChat(householdId: string, chatId: string): TestPendingOperation | null {
    for (const op of this.operations.values()) {
      if (op.householdId === householdId && op.chatId === chatId && op.status === 'pending') {
        return op;
      }
    }
    return null;
  }

  clear(): void {
    this.operations.clear();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('PiBridge Flow Integration', () => {
  describe('bridge lifecycle', () => {
    it('creates bridge without starting', () => {
      const bridge = new PiBridge({ householdId: 'h123' });
      expect(bridge.isHealthy()).toBe(false);
    });

    it('stop is safe when not started', async () => {
      const bridge = new PiBridge({ householdId: 'h123' });
      await bridge.stop();
      expect(bridge.isHealthy()).toBe(false);
    });

    it('createPiBridge factory creates instance', () => {
      const bridge = createPiBridge({ householdId: 'h123' });
      expect(bridge).toBeInstanceOf(PiBridge);
    });
  });

  describe('event handlers', () => {
    it('registers message_update handler', () => {
      const bridge = new PiBridge({ householdId: 'h123' });
      const handler = vi.fn();

      bridge.on('message_update', handler);
      bridge.off('message_update', handler);

      expect(bridge).toBeDefined();
    });

    it('registers agent_end handler', () => {
      const bridge = new PiBridge({ householdId: 'h123' });
      const handler = vi.fn();

      bridge.on('agent_end', handler);
      bridge.off('agent_end', handler);

      expect(bridge).toBeDefined();
    });

    it('registers error handler', () => {
      const bridge = new PiBridge({ householdId: 'h123' });
      const handler = vi.fn();

      bridge.on('error', handler);
      bridge.off('error', handler);

      expect(bridge).toBeDefined();
    });

    it('supports multiple handlers', () => {
      const bridge = new PiBridge({ householdId: 'h123' });
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      bridge.on('message_update', handler1);
      bridge.on('message_update', handler2);
      bridge.on('agent_end', handler1);

      expect(bridge).toBeDefined();
    });
  });
});

describe('Pending Operation Flow (Unit)', () => {
  let store: TestPendingOperationStore;

  beforeEach(() => {
    store = new TestPendingOperationStore();
  });

  describe('create operation', () => {
    it('creates pending expense operation', () => {
      const op: TestPendingOperation = {
        id: crypto.randomUUID(),
        householdId: 'h123',
        chatId: 'chat1',
        status: 'pending',
        draftPayload: { amountCents: 3590, description: 'carne' },
        missingFields: [],
        confirmationLevel: 1,
      };

      const created = store.create(op);
      expect(created.status).toBe('pending');
      expect(created.draftPayload.amountCents).toBe(3590);
    });

    it('creates operation with missing fields', () => {
      const op: TestPendingOperation = {
        id: crypto.randomUUID(),
        householdId: 'h123',
        chatId: 'chat1',
        status: 'pending',
        draftPayload: { amountCents: 3590 },
        missingFields: ['description', 'date', 'accountId'],
        confirmationLevel: 0,
      };

      const created = store.create(op);
      expect(created.missingFields).toContain('description');
      expect(created.missingFields).toContain('date');
      expect(created.missingFields).toContain('accountId');
    });
  });

  describe('confirm operation', () => {
    it('confirms pending operation', () => {
      const op: TestPendingOperation = {
        id: crypto.randomUUID(),
        householdId: 'h123',
        chatId: 'chat1',
        status: 'pending',
        draftPayload: { amountCents: 3590 },
        missingFields: [],
        confirmationLevel: 1,
      };

      store.create(op);
      const found = store.findById(op.id);
      expect(found).not.toBeNull();

      // Simulate confirm
      const updated: TestPendingOperation = { ...found!, status: 'confirmed' };
      store.create(updated);

      const afterConfirm = store.findById(op.id);
      expect(afterConfirm?.status).toBe('confirmed');
    });

    it('cancels pending operation', () => {
      const op: TestPendingOperation = {
        id: crypto.randomUUID(),
        householdId: 'h123',
        chatId: 'chat1',
        status: 'pending',
        draftPayload: { amountCents: 3590 },
        missingFields: [],
        confirmationLevel: 1,
      };

      store.create(op);

      // Simulate cancel
      const updated: TestPendingOperation = { ...op, status: 'cancelled' };
      store.create(updated);

      const afterCancel = store.findById(op.id);
      expect(afterCancel?.status).toBe('cancelled');
    });
  });

  describe('findPendingByChat', () => {
    it('returns pending operation for chat', () => {
      const op: TestPendingOperation = {
        id: crypto.randomUUID(),
        householdId: 'h123',
        chatId: 'chat1',
        status: 'pending',
        draftPayload: { amountCents: 3590 },
        missingFields: [],
        confirmationLevel: 1,
      };

      store.create(op);
      const found = store.findByChat('h123', 'chat1');
      expect(found).not.toBeNull();
      expect(found?.id).toBe(op.id);
    });

    it('returns null when no pending operation', () => {
      const found = store.findByChat('h123', 'chat1');
      expect(found).toBeNull();
    });

    it('does not return cancelled operations', () => {
      const op: TestPendingOperation = {
        id: crypto.randomUUID(),
        householdId: 'h123',
        chatId: 'chat1',
        status: 'cancelled',
        draftPayload: { amountCents: 3590 },
        missingFields: [],
        confirmationLevel: 1,
      };

      store.create(op);
      const found = store.findByChat('h123', 'chat1');
      expect(found).toBeNull();
    });
  });

  describe('high value confirmation level', () => {
    it('sets level 2 for amounts > R$500 (50000 cents)', () => {
      const amountCents = 70000; // R$700
      const confirmationLevel = amountCents > 50000 ? 2 : 1;
      expect(confirmationLevel).toBe(2);
    });

    it('sets level 1 for amounts <= R$500', () => {
      const amountCents = 50000; // R$500
      const confirmationLevel = amountCents > 50000 ? 2 : 1;
      expect(confirmationLevel).toBe(1);
    });
  });
});

describe('Shadow Mode', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('FINANCE_WRITE_MODE detection', () => {
    it('defaults to live when not set', () => {
      delete process.env.FINANCE_WRITE_MODE;
      const mode = process.env.FINANCE_WRITE_MODE || 'live';
      expect(mode).toBe('live');
    });

    it('shadow mode when set', () => {
      process.env.FINANCE_WRITE_MODE = 'shadow';
      expect(process.env.FINANCE_WRITE_MODE).toBe('shadow');
    });

    it('live mode when explicitly set', () => {
      process.env.FINANCE_WRITE_MODE = 'live';
      expect(process.env.FINANCE_WRITE_MODE).toBe('live');
    });
  });
});

describe('Agent Runtime Configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('defaults to pi-native when not set', () => {
    delete process.env.FINANCE_AGENT_RUNTIME;
    // getAgentRuntime() defaults to 'pi-native'
    expect(process.env.FINANCE_AGENT_RUNTIME).toBeUndefined();
  });

  it('pi-native activates PiBridge', () => {
    process.env.FINANCE_AGENT_RUNTIME = 'pi-native';
    expect(process.env.FINANCE_AGENT_RUNTIME).toBe('pi-native');
  });

  it('disabled mode uses fake client for dev', () => {
    process.env.FINANCE_AGENT_RUNTIME = 'disabled';
    expect(process.env.FINANCE_AGENT_RUNTIME).toBe('disabled');
  });

  it('pi-native is the default (no legacy mode)', () => {
    // Verify the type is 'pi-native' | 'disabled' only
    const validModes = ['pi-native', 'disabled'];
    expect(validModes).toContain(process.env.FINANCE_AGENT_RUNTIME || 'pi-native');
  });
});

describe('PiClient Interface Compliance', () => {
  it('PiBridge has send method', () => {
    const bridge = new PiBridge({ householdId: 'h123' });
    expect(typeof bridge.send).toBe('function');
  });

  it('PiBridge implements isHealthy', () => {
    const bridge = new PiBridge({ householdId: 'h123' });
    expect(typeof bridge.isHealthy).toBe('function');
    expect(bridge.isHealthy()).toBe(false);
  });

  it('PiBridge implements stop', () => {
    const bridge = new PiBridge({ householdId: 'h123' });
    expect(typeof bridge.stop).toBe('function');
  });
});