/**
 * Runtime errors tests — structural validation
 */

import { describe, it, expect } from 'vitest';
import {
  ToolError,
  ValidationError,
  NotFoundError,
  AlreadyExistsError,
  ConflictError,
  ExpiredError,
  validateUUID,
  validatePositiveCents,
  validateCents,
  validateDateString,
  validateNonEmpty,
  validateKind,
} from '../errors';

describe('error types', () => {
  describe('ToolError', () => {
    it('has code and context properties', () => {
      const err = new ToolError('test error', 'TEST_CODE', { foo: 'bar' });
      expect(err.message).toBe('test error');
      expect(err.code).toBe('TEST_CODE');
      expect(err.context).toEqual({ foo: 'bar' });
      expect(err.name).toBe('ToolError');
    });
  });

  describe('ValidationError', () => {
    it('has correct code', () => {
      const err = new ValidationError('invalid input', { field: 'amount_cents' });
      expect(err.code).toBe('VALIDATION_ERROR');
      expect(err.name).toBe('ValidationError');
    });
  });

  describe('NotFoundError', () => {
    it('formats message with entity and id', () => {
      const err = new NotFoundError('account', 'uuid-123');
      expect(err.message).toBe('account not found: uuid-123');
      expect(err.code).toBe('NOT_FOUND');
    });
  });

  describe('AlreadyExistsError', () => {
    it('formats message with entity, field, value', () => {
      const err = new AlreadyExistsError('account', 'name', 'Conta Corrente');
      expect(err.message).toBe('account with name=Conta Corrente already exists');
      expect(err.code).toBe('ALREADY_EXISTS');
    });
  });

  describe('ConflictError', () => {
    it('has CONFLICT code', () => {
      const err = new ConflictError('operation already in progress');
      expect(err.code).toBe('CONFLICT');
    });
  });

  describe('ExpiredError', () => {
    it('formats message with operation id', () => {
      const err = new ExpiredError('op-uuid-456');
      expect(err.message).toBe('Operation expired: op-uuid-456');
      expect(err.code).toBe('EXPIRED');
    });
  });
});

describe('validation helpers', () => {
  describe('validateUUID', () => {
    it('accepts valid UUIDs', () => {
      expect(() => validateUUID('550e8400-e29b-41d4-a716-446655440000', 'id')).not.toThrow();
    });

    it('rejects invalid UUIDs', () => {
      expect(() => validateUUID('not-a-uuid', 'id')).toThrow(ValidationError);
      expect(() => validateUUID('', 'id')).toThrow(ValidationError);
      expect(() => validateUUID('123', 'id')).toThrow(ValidationError);
    });
  });

  describe('validatePositiveCents', () => {
    it('accepts positive integers', () => {
      expect(() => validatePositiveCents(1, 'amount')).not.toThrow();
      expect(() => validatePositiveCents(50000, 'amount')).not.toThrow();
    });

    it('rejects zero and negative', () => {
      expect(() => validatePositiveCents(0, 'amount')).toThrow(ValidationError);
      expect(() => validatePositiveCents(-1, 'amount')).toThrow(ValidationError);
    });

    it('rejects non-integers', () => {
      expect(() => validatePositiveCents(1.5, 'amount')).toThrow(ValidationError);
      expect(() => validatePositiveCents(NaN, 'amount')).toThrow(ValidationError);
    });
  });

  describe('validateCents', () => {
    it('accepts any integer (positive, zero, negative)', () => {
      expect(() => validateCents(-50000, 'initial_balance')).not.toThrow();
      expect(() => validateCents(0, 'initial_balance')).not.toThrow();
      expect(() => validateCents(10000, 'initial_balance')).not.toThrow();
    });

    it('rejects non-integers', () => {
      expect(() => validateCents(1.5, 'initial_balance')).toThrow(ValidationError);
    });
  });

  describe('validateDateString', () => {
    it('accepts valid ISO date', () => {
      expect(() => validateDateString('2026-06-03', 'date')).not.toThrow();
    });

    it('rejects invalid formats', () => {
      expect(() => validateDateString('06-03-2026', 'date')).toThrow(ValidationError);
      expect(() => validateDateString('2026/06/03', 'date')).toThrow(ValidationError);
      expect(() => validateDateString('', 'date')).toThrow(ValidationError);
    });
  });

  describe('validateNonEmpty', () => {
    it('accepts non-empty strings', () => {
      expect(() => validateNonEmpty('hello', 'name')).not.toThrow();
      expect(() => validateNonEmpty('a', 'name')).not.toThrow();
    });

    it('rejects empty and whitespace-only', () => {
      expect(() => validateNonEmpty('', 'name')).toThrow(ValidationError);
      expect(() => validateNonEmpty('   ', 'name')).toThrow(ValidationError);
    });
  });

  describe('validateKind', () => {
    it('accepts allowed values', () => {
      expect(() => validateKind('expense', ['expense', 'income'], 'kind')).not.toThrow();
      expect(() => validateKind('income', ['expense', 'income'], 'kind')).not.toThrow();
    });

    it('rejects unknown values', () => {
      expect(() => validateKind('transfer', ['expense', 'income'], 'kind')).toThrow(ValidationError);
      expect(() => validateKind('', ['expense', 'income'], 'kind')).toThrow(ValidationError);
    });
  });
});