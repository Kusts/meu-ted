// ─────────────────────────────────────────────────────────────────────────────
// Log sanitizer tests
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import {
  sanitizeLog,
  sanitizePhone,
  sanitizeToken,
  sanitizeMessage,
  sanitize,
} from './log-sanitizer.js';

describe('log-sanitizer', () => {
  describe('sanitizePhone', () => {
    it('redacts a Brazilian phone number JID', () => {
      expect(sanitizePhone('5511999998888@s.whatsapp.net'))
        .toBe('55******8888@s.whatsapp.net');
    });

    it('redacts a phone with sender suffix', () => {
      expect(sanitizePhone('5511988887777:19@s.whatsapp.net'))
        .toBe('55******7777@s.whatsapp.net');
    });

    it('returns same if not a phone pattern', () => {
      expect(sanitizePhone('not-a-phone'))
        .toBe('not-a-phone');
    });

    it('handles undefined / empty', () => {
      expect(sanitizePhone('')).toBe('');
    });
  });

  describe('sanitizeToken', () => {
    it('replaces token-like strings with [REDACTED]', () => {
      expect(sanitizeToken('mytoken-abc123-secret')).toBe('[REDACTED]');
    });

    it('passes short strings through unchanged', () => {
      expect(sanitizeToken('ok')).toBe('ok');
    });

    it('handles empty', () => {
      expect(sanitizeToken('')).toBe('');
    });
  });

  describe('sanitizeMessage', () => {
    it('truncates message to maxLen', () => {
      const long = 'a'.repeat(200);
      const result = sanitizeMessage(long, 100);
      expect(result.length).toBeLessThanOrEqual(103); // 100 + "..."
      expect(result.endsWith('...')).toBe(true);
    });

    it('keeps short messages intact', () => {
      expect(sanitizeMessage('oi', 100)).toBe('oi');
    });

    it('sanitizes phone numbers inside messages', () => {
      const msg = 'paguei para 5511999998888@s.whatsapp.net';
      const result = sanitizeMessage(msg, 200);
      // After sanitizePhone: DDD preserved, last 4 digits visible
      expect(result).toContain('55******');
      expect(result).not.toContain('999888');
    });

    it('handles empty', () => {
      expect(sanitizeMessage('')).toBe('');
    });
  });

  describe('sanitize', () => {
    it('redacts token values from KEY=VALUE patterns', () => {
      const result = sanitize('EVOLUTION_GO_INSTANCE_TOKEN=abc123secret');
      // Value must be fully redacted
      expect(result).not.toContain('abc123secret');
      // Entire KEY=VALUE may be redacted as both key name and value
      // are sensitive — key name is 27 chars (token pattern)
      expect(result).toContain('[REDACTED]');
    });

    it('does not modify benign strings', () => {
      expect(sanitize('[bridge] listening on port 3000')).toBe(
        '[bridge] listening on port 3000',
      );
    });
  });

  describe('sanitizeLog', () => {
    it('returns sanitized string for a single string arg', () => {
      const result = sanitizeLog('phone: 5511999998888@s.whatsapp.net token: abcdef1234567890abcde');
      expect(result).not.toContain('999888');
      expect(result).not.toContain('abcdef1234567890abcde');
    });

    it('handles multiple args', () => {
      const result = sanitizeLog(
        'user:',
        '5511999998888@s.whatsapp.net',
        'msg:',
        'token secret is abcdef1234567890abcde end',
      );
      expect(result).not.toContain('999888');
      expect(result).not.toContain('abcdef1234567890abcde');
    });
  });
});
