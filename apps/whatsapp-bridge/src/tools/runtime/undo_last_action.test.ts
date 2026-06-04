/**
 * undo_last_action — Runtime test (TDD)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { undoLastAction } from './undo_last_action';
import { query } from '../db';

vi.mock('../db.js', () => ({
  query: vi.fn(),
  getPool: vi.fn(),
  withTransaction: vi.fn(),
  closePool: vi.fn(),
  isDatabaseHealthy: vi.fn(),
}));
vi.mock('pg', () => ({
  __esModule: true,
  default: { Pool: vi.fn(() => ({ query: vi.fn(), connect: vi.fn(), end: vi.fn() })) },
  Pool: vi.fn(() => ({ query: vi.fn(), connect: vi.fn(), end: vi.fn() })),
}));

describe('undo_last_action runtime', () => {
  beforeEach(() => {
    vi.mocked(query).mockReset();
  });

  // Undo CREATE: soft-delete the transaction
  it('undoes CREATE by setting deleted_at', async () => {
    vi.mocked(query)
      .mockResolvedValueOnce({ rows: [{ id: 'log-1', action: 'create', entity_type: 'transaction', entity_id: 'tx-1', before_json: null, after_json: {} }], command: 'SELECT', rowCount: 1 } as any)
      .mockResolvedValueOnce({ rows: [{ id: 'tx-1' }], command: 'UPDATE', rowCount: 1 } as any);

    const result = await undoLastAction(
      'chat-123',
      '550e8400-e29b-41d4-a716-446655440099'
    );

    expect(result.success).toBe(true);
    expect(result.undone_action).toBe('create');
    expect(result.entity_id).toBe('tx-1');
  });

  // Undo DELETE: clear deleted_at to restore
  it('undoes DELETE by clearing deleted_at', async () => {
    vi.mocked(query)
      .mockResolvedValueOnce({ rows: [{ id: 'log-1', action: 'delete', entity_type: 'transaction', entity_id: 'tx-1', before_json: {}, after_json: null }], command: 'SELECT', rowCount: 1 } as any)
      .mockResolvedValueOnce({ rows: [{ id: 'tx-1' }], command: 'UPDATE', rowCount: 1 } as any);

    const result = await undoLastAction(
      'chat-123',
      '550e8400-e29b-41d4-a716-446655440099'
    );

    expect(result.success).toBe(true);
    expect(result.undone_action).toBe('delete');
  });

  // Undo UPDATE: restore before_json fields
  it('undoes UPDATE by restoring before_json', async () => {
    vi.mocked(query)
      .mockResolvedValueOnce({ rows: [{
        id: 'log-1',
        action: 'update',
        entity_type: 'transaction',
        entity_id: 'tx-1',
        before_json: { description: 'Old desc', amount_cents: 1000 },
        after_json: { description: 'New desc', amount_cents: 2000 },
      }], command: 'SELECT', rowCount: 1 } as any)
      .mockResolvedValueOnce({ rows: [{ id: 'tx-1' }], command: 'UPDATE', rowCount: 1 } as any);

    const result = await undoLastAction(
      'chat-123',
      '550e8400-e29b-41d4-a716-446655440099'
    );

    expect(result.success).toBe(true);
    expect(result.undone_action).toBe('update');
  });

  it('rejects when no audit log found', async () => {
    vi.mocked(query).mockResolvedValueOnce({ rows: [], command: 'SELECT', rowCount: 0 } as any);

    const result = await undoLastAction(
      'chat-123',
      '550e8400-e29b-41d4-a716-446655440099'
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('No action found');
  });

  it('rejects non-transaction entity types', async () => {
    vi.mocked(query).mockResolvedValueOnce({ rows: [{ id: 'log-1', action: 'create', entity_type: 'account', entity_id: 'acc-1', before_json: null, after_json: {} }], command: 'SELECT', rowCount: 1 } as any);

    const result = await undoLastAction(
      'chat-123',
      '550e8400-e29b-41d4-a716-446655440099'
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('Cannot undo');
  });

  it('rejects update without before_json', async () => {
    vi.mocked(query).mockResolvedValueOnce({ rows: [{ id: 'log-1', action: 'update', entity_type: 'transaction', entity_id: 'tx-1', before_json: null, after_json: {} }], command: 'SELECT', rowCount: 1 } as any);

    const result = await undoLastAction(
      'chat-123',
      '550e8400-e29b-41d4-a716-446655440099'
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('No before_json');
  });

  it('rejects empty chat_id', async () => {
    const result = await undoLastAction('', '550e8400-e29b-41d4-a716-446655440099');

    expect(result.success).toBe(false);
    expect(result.error).toContain('empty');
  });

  it('rejects invalid household_id UUID', async () => {
    const result = await undoLastAction('chat-123', 'not-a-uuid');

    expect(result.success).toBe(false);
  });
});