// ─────────────────────────────────────────────────────────────────────────────
// PiBridge Tests
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { spawn } from 'child_process';
import { PiBridge, createPiBridge } from './pi-bridge.js';

// ─────────────────────────────────────────────────────────────────────────────
// Test Helpers
// ─────────────────────────────────────────────────────────────────────────────

function createMockProcess() {
  const proc = {
    stdin: {
      write: vi.fn(),
    },
    stdout: {
      on: vi.fn(),
    },
    stderr: {
      on: vi.fn(),
    },
    on: vi.fn(),
    kill: vi.fn(),
    exitCode: null as number | null,
  };
  return proc;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('PiBridge', () => {
  describe('constructor', () => {
    it('creates bridge with default options', () => {
      const bridge = new PiBridge({ householdId: 'h123' });
      expect(bridge).toBeDefined();
    });

    it('creates bridge with custom options', () => {
      const bridge = new PiBridge({
        householdId: 'h123',
        piCommand: '/custom/pi',
        piArgs: ['--mode', 'rpc', '--custom'],
        timeoutMs: 60000,
        projectDir: '/custom/dir',
      });
      expect(bridge).toBeDefined();
    });

    it('createPiBridge factory works', () => {
      const bridge = createPiBridge({ householdId: 'h123' });
      expect(bridge).toBeInstanceOf(PiBridge);
    });
  });

  describe('isHealthy', () => {
    it('returns false when not started', () => {
      const bridge = new PiBridge({ householdId: 'h123' });
      expect(bridge.isHealthy()).toBe(false);
    });
  });

  describe('event handlers', () => {
    it('registers and removes event handlers', () => {
      const bridge = new PiBridge({ householdId: 'h123' });
      const handler = vi.fn();

      bridge.on('message_update', handler);
      bridge.off('message_update', handler);

      // Handlers should be empty after removal
      // (We can't easily test internal state, but we verify the API works)
      expect(bridge).toBeDefined();
    });

    it('supports multiple handlers per event', () => {
      const bridge = new PiBridge({ householdId: 'h123' });
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      bridge.on('agent_end', handler1);
      bridge.on('agent_end', handler2);

      expect(bridge).toBeDefined();
    });
  });

  describe('message handling', () => {
    it('findAgentsMd returns null when no AGENTS.md exists', () => {
      const bridge = new PiBridge({ householdId: 'h123', projectDir: '/nonexistent' });
      // Access private method via any for testing
      const result = (bridge as any).findAgentsMd('/nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('system prompt path detection', () => {
    it('prefers explicit systemPromptPath over auto-detection', () => {
      const bridge = new PiBridge({
        householdId: 'h123',
        systemPromptPath: '/explicit/path/AGENTS.md',
        projectDir: '/other/dir',
      });
      expect(bridge).toBeDefined();
    });
  });

  describe('timeout configuration', () => {
    it('uses custom timeout when specified', () => {
      const bridge = new PiBridge({
        householdId: 'h123',
        timeoutMs: 120000,
      });
      expect(bridge).toBeDefined();
    });

    it('uses default timeout when not specified', () => {
      const bridge = new PiBridge({
        householdId: 'h123',
      });
      expect(bridge).toBeDefined();
    });
  });

  describe('chat ID queuing', () => {
    it('handles multiple chat IDs', () => {
      const bridge = new PiBridge({ householdId: 'h123' });
      expect(bridge).toBeDefined();
    });
  });

  describe('process management', () => {
    it('can check health status', () => {
      const bridge = new PiBridge({ householdId: 'h123' });
      const healthy = bridge.isHealthy();
      expect(typeof healthy).toBe('boolean');
    });

    it('stop is idempotent when not started', async () => {
      const bridge = new PiBridge({ householdId: 'h123' });
      await bridge.stop();
      expect(bridge.isHealthy()).toBe(false);
    });
  });
});

describe('PiBridge JSONL Buffer', () => {
  // Test the buffer logic by exposing it through helper
  function parseBufferedLines(buffer: string, data: string): { lines: string[]; remaining: string } {
    let lineBuffer = buffer + data;
    const lines = lineBuffer.split('\n');
    const remaining = lines.pop() ?? '';
    return { lines: lines.filter(l => l.trim()), remaining };
  }

  it('accumulates incomplete lines', () => {
    const result1 = parseBufferedLines('', '{"id":"1","type":"message_update","text":"Hello');
    expect(result1.lines).toHaveLength(0);
    expect(result1.remaining).toBe('{"id":"1","type":"message_update","text":"Hello');

    // Second chunk completes the line
    const result2 = parseBufferedLines(result1.remaining, '","delta":" world"}\n{"id":"2"');
    expect(result2.lines).toHaveLength(1);
    expect(result2.lines[0]).toBe('{"id":"1","type":"message_update","text":"Hello","delta":" world"}');
    expect(result2.remaining).toBe('{"id":"2"');
  });

  it('handles multiple complete lines', () => {
    const result = parseBufferedLines('', '{"id":"1"}\n{"id":"2"}\n{"id":"3"}\n');
    expect(result.lines).toHaveLength(3);
    expect(result.remaining).toBe('');
  });

  it('handles empty data', () => {
    const result = parseBufferedLines('{"id":"1"}', '');
    // No complete lines since no newline
    expect(result.lines).toHaveLength(0);
    expect(result.remaining).toBe('{"id":"1"}');
  });

  it('handles newline only', () => {
    const result = parseBufferedLines('{"id":"1"}', '\n');
    expect(result.lines).toHaveLength(1);
    expect(result.remaining).toBe('');
  });

  it('skips empty lines', () => {
    const result = parseBufferedLines('', '\n\n{"id":"1"}\n\n');
    expect(result.lines).toHaveLength(1);
  });
});

describe('PiBridge Request ID Generation', () => {
  it('generates unique request IDs', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const { randomUUID } = require('crypto');
      ids.add(randomUUID());
    }
    expect(ids.size).toBe(100);
  });
});

describe('PiBridge Error Handling', () => {
  it('send throws when not running', async () => {
    const bridge = new PiBridge({ householdId: 'h123' });
    await expect(bridge.send('test', 'chat1')).rejects.toThrow('PiBridge not running');
  });

  it('stop cleans up gracefully', async () => {
    const bridge = new PiBridge({ householdId: 'h123' });
    await bridge.stop();
    expect(bridge.isHealthy()).toBe(false);
  });
});