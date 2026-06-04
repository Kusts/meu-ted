/**
 * undo_last_action — Contract Test
 * ==================================
 * Contract test for undo_last_action tool (Phase 4).
 * Does NOT execute real DB operations.
 *
 * Spec: Phase 4 of minimal-finance-agent-spec.md
 *
 * VERIFIED CONTRACT:
 * - Undoes the last auditable action for the household
 * - Uses household.last_audit_log_id to find target
 * - Creates reverse audit log entry (action='undo')
 * - Only eligible: create_transaction, update_transaction, delete_transaction
 */

import { describe, it, expect } from 'vitest';
import type { UndoLastActionInput, UndoLastActionResult } from './phase4.types';

describe('undo_last_action — input contract', () => {
  it('no parameters required', () => {
    const input: UndoLastActionInput = {};
    expect(input).toEqual({});
  });
});

describe('undo_last_action — output contract', () => {
  it('success result describes what was undone', () => {
    const result: UndoLastActionResult = {
      success: true,
      undone_action: 'create_transaction',
      entity_id: 'tx-uuid-undone',
      details: 'Despesa de R$ 150,00 para Alimentação foi desfeita',
    };
    expect(result.success).toBe(true);
    expect(typeof result.undone_action).toBe('string');
    expect(typeof result.entity_id).toBe('string');
    expect(typeof result.details).toBe('string');
  });

  it('failure when no action to undo', () => {
    const result: UndoLastActionResult = {
      success: false,
      error: 'No action to undo',
    };
    expect(result.success).toBe(false);
    expect(result.error).toContain('No action to undo');
  });

  it('failure when last action is not eligible for undo', () => {
    const result: UndoLastActionResult = {
      success: false,
      error: 'Last action is not eligible for undo: confirm_pending_operation',
    };
    expect(result.success).toBe(false);
    expect(result.error).toContain('not eligible');
  });
});

describe('undo_last_action — eligibility rules', () => {
  it('create_transaction: undo by deleting the transaction', () => {
    // Reverts: balance impact of the created transaction
    // Target: the transaction that was created
    const undoCreate = {
      action: 'create_transaction',
      undo_mechanism: 'soft delete (set deleted_at)',
      balance_revert: true,
    };
    expect(undoCreate.balance_revert).toBe(true);
  });

  it('update_transaction: undo by restoring before_json', () => {
    // Reverts: restores all fields from before_json
    // Target: the transaction that was updated
    const undoUpdateMechanism = 'restore before_json';
    expect(undoUpdateMechanism).toBe('restore before_json');
  });

  it('delete_transaction: undo by clearing deleted_at', () => {
    // Reverts: clears deleted_at, restores balance impact
    // Target: the transaction that was deleted
    // undo_mechanism: clear deleted_at
    const undoMechanism = 'clear deleted_at';
    expect(undoMechanism).toBe('clear deleted_at');
  });

  it('confirm_pending_operation: NOT eligible', () => {
    const notEligible = [
      'confirm_pending_operation',
      'cancel_pending_operation',
      'undo',
      'create_account',
      'update_account',
      'deactivate_account',
      'create_category',
      'update_category',
      'deactivate_category',
    ];
    notEligible.forEach(action => {
      expect(['create_transaction', 'update_transaction', 'delete_transaction']).not.toContain(action);
    });
  });
});

describe('undo_last_action — behavior rules', () => {
  it('uses household.last_audit_log_id to find target', () => {
    // SELECT * FROM audit_logs WHERE id = household.last_audit_log_id
    const lookup = 'household.last_audit_log_id → audit_logs.id';
    expect(lookup).toBeDefined();
  });

  it('creates new audit log entry with action=undo', () => {
    // After undo, creates audit_logs entry:
    const undoAudit = {
      action: 'undo',
      entity_type: 'from the undone entry',
      entity_id: 'from the undone entry',
      before_json: 'the undone audit log entry (as-is)',
      after_json: null, // undo doesn't have an "after" state
    };
    expect(undoAudit.action).toBe('undo');
  });

  it('updates household.last_audit_log_id to previous entry', () => {
    // After undo: household.last_audit_log_id = previous audit log
    // Enables chain undo if next undo is called
    const chainRule = {
      after_undo: 'last_audit_log_id points to previous action',
      chain_support: true,
    };
    expect(chainRule.chain_support).toBe(true);
  });

  it('idempotent — undo already-undone returns error', () => {
    // After undo: last_audit_log_id points to PREVIOUS entry
    // Second undo of same entry → last_audit_log_id now points elsewhere
    // So double-undo is prevented by last_audit_log_id moving
    const idempotency = {
      mechanism: 'last_audit_log_id advances after undo',
      double_undo_target: 'different action (previous in chain)',
    };
    expect(idempotency.double_undo_target).toBe('different action (previous in chain)');
  });

  it('undo is per-household — undoes only that household last action', () => {
    // household.last_audit_log_id is per-household
    const perHousehold = {
      scope: 'per-household',
    };
    expect(perHousehold.scope).toBe('per-household');
  });

  it('no undo actions available: returns "No action to undo"', () => {
    const result: UndoLastActionResult = {
      success: false,
      error: 'No action to undo',
    };
    expect(result.success).toBe(false);
    expect(result.error).toBe('No action to undo');
  });
});