import { describe, expect, it } from 'vitest';
import {
  mapAccountRow,
  mapCardPurchaseRow,
  mapCategoryRow,
  mapCopyThroughRow,
  mapDeviceTokenRow,
  mapInviteRow,
  mapMembershipRow,
  mapTransactionRow,
  MappingError,
} from '../../src/scripts/canonical-converter/mapping.js';

const household = '11111111-1111-4111-8111-111111111111';

const memberCtx = () => ({
  userIdByAuthId: new Map([['auth-u1', '22222222-2222-4222-8222-222222222222']]),
  userIds: new Set(['22222222-2222-4222-8222-222222222222']),
});

describe('canonical converter mapping (M2)', () => {
  it('maps legacy accounts to bank by default and never infers cash', () => {
    const bank = mapAccountRow({
      id: 'a1',
      household_id: household,
      name: 'Checking',
      is_credit_card: false,
      active: true,
      initial_balance_cents: 0,
    });
    expect(bank.values).toMatchObject({ id: 'a1', kind: 'bank', status: 'active', balance_cents: 0 });
    expect(bank.values.kind).not.toBe('cash');

    const missingFlags = mapAccountRow({ id: 'a2', household_id: household, name: 'Wallet' });
    expect(missingFlags.values).toMatchObject({ kind: 'bank', status: 'active' });

    const card = mapAccountRow({
      id: 'a3',
      household_id: household,
      name: 'Card',
      is_credit_card: true,
      active: false,
    });
    expect(card.values).toMatchObject({ kind: 'credit_card', status: 'inactive' });
  });

  it('maps the legacy initial anchor exactly and leaves the balance to M3', () => {
    const anchored = mapAccountRow({
      id: 'a1',
      household_id: household,
      name: 'Checking',
      is_credit_card: false,
      active: true,
      initial_balance_cents: 500,
    });
    expect(anchored.values).toMatchObject({
      initial_balance_cents: '500',
      balance_cents: 0,
    });

    const legacyBigint = mapAccountRow({
      id: 'a2',
      household_id: household,
      name: 'Legacy pg BIGINT',
      initial_balance_cents: '1500',
    });
    expect(legacyBigint.values).toMatchObject({ initial_balance_cents: '1500' });

    expect(() =>
      mapAccountRow({ id: 'a3', household_id: household, name: 'X', initial_balance_cents: 12.5 }),
    ).toThrow(MappingError);
    expect(() =>
      mapAccountRow({ id: 'a4', household_id: household, name: 'X', initial_balance_cents: 'not-a-number' }),
    ).toThrow(MappingError);
  });

  it('rejects accounts with missing scope', () => {
    expect(() => mapAccountRow({ id: 'a1', household_id: null, name: 'X' })).toThrow(MappingError);
    expect(() => mapAccountRow({ id: 'a1', name: 'X' })).toThrow(MappingError);
  });

  it('collects unknown account columns as unmapped instead of dropping them silently', () => {
    const mapped = mapAccountRow({
      id: 'a1',
      household_id: household,
      name: 'X',
      future_column: 'keep-me',
    });
    expect(mapped.unmapped).toMatchObject({ future_column: 'keep-me' });
    expect(mapped.values).not.toHaveProperty('future_column');
  });

  it('maps legacy categories active flag to status', () => {
    const active = mapCategoryRow({
      id: 'c1',
      household_id: household,
      name: 'Food',
      kind: 'expense',
      active: true,
      parent_id: null,
    });
    expect(active.values).toMatchObject({ status: 'active', name: 'Food' });
    const inactive = mapCategoryRow({
      id: 'c2',
      household_id: household,
      name: 'Old',
      kind: 'income',
      active: false,
    });
    expect(inactive.values).toMatchObject({ status: 'inactive' });
  });

  it('routes transaction legs by kind and keeps statement payments out', () => {
    const expense = mapTransactionRow({
      id: 't1',
      household_id: household,
      kind: 'expense',
      description: 'Bread',
      amount_cents: 1000,
      date: '2026-09-01',
      from_account_id: 'acc-a',
      to_account_id: null,
    });
    expect(expense.values).toMatchObject({ account_id: 'acc-a' });
    expect(expense.values).not.toHaveProperty('transfer_to_account_id');
    expect(expense.values).not.toHaveProperty('statement_payment_id');

    const income = mapTransactionRow({
      id: 't2',
      household_id: household,
      kind: 'income',
      description: 'Pay',
      amount_cents: 5000,
      date: '2026-09-01',
      from_account_id: null,
      to_account_id: 'acc-b',
    });
    expect(income.values).toMatchObject({ account_id: 'acc-b' });

    const transfer = mapTransactionRow({
      id: 't3',
      household_id: household,
      kind: 'transfer',
      description: 'Move',
      amount_cents: 2000,
      date: '2026-09-02',
      from_account_id: 'acc-a',
      to_account_id: 'acc-b',
    });
    expect(transfer.values).toMatchObject({ account_id: 'acc-a', transfer_to_account_id: 'acc-b' });
  });

  it('rejects incoherent transaction legs fail-closed', () => {
    const base = {
      household_id: household,
      description: 'X',
      amount_cents: 100,
      date: '2026-09-01',
    };
    expect(() =>
      mapTransactionRow({ ...base, id: 't1', kind: 'expense', from_account_id: null, to_account_id: 'acc-b' }),
    ).toThrow(MappingError);
    expect(() =>
      mapTransactionRow({ ...base, id: 't2', kind: 'expense', from_account_id: 'acc-a', to_account_id: 'acc-b' }),
    ).toThrow(MappingError);
    expect(() =>
      mapTransactionRow({ ...base, id: 't3', kind: 'income', from_account_id: 'acc-a', to_account_id: null }),
    ).toThrow(MappingError);
    expect(() =>
      mapTransactionRow({ ...base, id: 't4', kind: 'transfer', from_account_id: 'acc-a', to_account_id: 'acc-a' }),
    ).toThrow(MappingError);
    expect(() =>
      mapTransactionRow({
        ...base,
        id: 't5',
        kind: 'transfer',
        from_account_id: 'acc-a',
        to_account_id: 'acc-b',
        category_id: 'cat-1',
      }),
    ).toThrow(MappingError);
    expect(() =>
      mapTransactionRow({ ...base, id: 't6', kind: 'refund', from_account_id: 'acc-a' }),
    ).toThrow(MappingError);
  });

  it('preserves legacy card-purchase columns on transactions and reports the rest', () => {
    const mapped = mapTransactionRow({
      id: 't1',
      household_id: household,
      kind: 'expense',
      description: 'Card buy',
      amount_cents: 3000,
      date: '2026-09-03',
      from_account_id: 'acc-a',
      is_credit_card_purchase: true,
      statement_id: 'st-1',
      installments_total: 3,
      installment_number: 1,
      mystery_column: 42,
    });
    expect(mapped.values).toMatchObject({
      statement_id: 'st-1',
      installments_total: 3,
      installment_number: 1,
    });
    // No canonical transactions column exists for the legacy card flag:
    // it must surface as unmapped (archive-preserved), never silently
    // dropped and never written.
    expect(mapped.values).not.toHaveProperty('is_credit_card_purchase');
    expect(mapped.unmapped).toMatchObject({ is_credit_card_purchase: true, mystery_column: 42 });
  });

  it('maps card purchases with installment range validation', () => {
    const mapped = mapCardPurchaseRow({
      id: 'cp1',
      household_id: household,
      statement_id: 'st-1',
      description: 'Shop',
      amount_cents: 9000,
      date: '2026-09-04',
      installments: 3,
      transaction_id: 't1',
      source_message_id: 'wa-123',
    });
    expect(mapped.values).toMatchObject({ installments_total: 3, transaction_id: 't1' });
    expect(mapped.unmapped).toMatchObject({ source_message_id: 'wa-123' });
    expect(() =>
      mapCardPurchaseRow({
        id: 'cp2',
        household_id: household,
        statement_id: 'st-1',
        installments_total: 2 ** 31,
      }),
    ).toThrow(MappingError);
  });

  it('imports device tokens by hash with a non-secret placeholder', () => {
    const mapped = mapDeviceTokenRow({
      token: 'real-secret-never-copied',
      token_hash: 'abc123',
      device_id: 'dev-1',
      household_id: household,
      legacy: true,
    });
    expect(mapped.values).toMatchObject({
      token: 'converted:abc123',
      token_hash: 'abc123',
      device_id: 'dev-1',
    });
    expect(mapped.values.token).not.toContain('real-secret');
    expect(() =>
      mapDeviceTokenRow({ device_id: 'dev-2', household_id: household }),
    ).toThrow(MappingError);
  });

  it('copies identical-shape entities through with scope validation', () => {
    const mapped = mapCopyThroughRow(
      { id: 'h1', name: 'Home', kind: 'shared', invented: 'kept-as-unmapped' },
      { entity: 'households', targetColumns: ['id', 'name', 'kind'], scopeKeys: [] },
    );
    expect(mapped.values).toEqual({ id: 'h1', name: 'Home', kind: 'shared' });
    expect(mapped.unmapped).toMatchObject({ invented: 'kept-as-unmapped' });
    expect(() =>
      mapCopyThroughRow({ id: 'u1' }, { entity: 'users', targetColumns: ['id'], scopeKeys: ['household_id'] }),
    ).toThrow(MappingError);
  });

  it('resolves membership users without synthesizing rows', () => {
    const byAuth = mapMembershipRow(
      { id: 'm1', user_id: 'auth-u1', household_id: household, role: 'owner' },
      memberCtx(),
    );
    expect(byAuth.values).toMatchObject({
      user_id: '22222222-2222-4222-8222-222222222222',
      household_id: household,
      role: 'owner',
    });
    expect(byAuth.values).not.toHaveProperty('id');
    expect(() =>
      mapMembershipRow({ id: 'm2', user_id: 'auth-ghost', household_id: household, role: 'member' }, memberCtx()),
    ).toThrow(MappingError);
    expect(() =>
      mapMembershipRow({ id: 'm3', user_id: 'auth-u1', household_id: household }, memberCtx()),
    ).toThrow(MappingError);
  });

  it('maps invites with normalized email and resolved inviter', () => {    const mapped = mapInviteRow(
      {
        id: 'i1',
        household_id: household,
        email: 'Guest@Example.com',
        role: 'member',
        token_hash: 'th-1',
        expires_at: '2026-10-01T00:00:00Z',
        accepted_at: '2026-09-02T00:00:00Z',
        invited_by_user_id: 'auth-u1',
      },
      memberCtx(),
    );
    expect(mapped.values).toMatchObject({
      email_normalized: 'guest@example.com',
      consumed_at: '2026-09-02T00:00:00Z',
      invited_by: '22222222-2222-4222-8222-222222222222',
    });
    expect(mapped.values).not.toHaveProperty('invited_by_user_id');
    expect(() =>
      mapInviteRow(
        { id: 'i2', household_id: household, email: 'x@y.z', role: 'member', expires_at: '2026-10-01' },
        memberCtx(),
      ),
    ).toThrow(MappingError);
  });

  it('FINDING-2 RED: preserves money beyond MAX_SAFE_INTEGER exactly (pg BIGINT arrives as string)', () => {
    const anchored = mapAccountRow({
      id: 'a-big',
      household_id: household,
      name: 'Big',
      initial_balance_cents: '9007199254740993',
    });
    expect(String(anchored.values.initial_balance_cents)).toBe('9007199254740993');

    const moved = mapTransactionRow({
      id: 't-big',
      household_id: household,
      kind: 'expense',
      description: 'Big',
      amount_cents: '9007199254740993',
      date: '2026-09-01',
      from_account_id: 'acc-a',
    });
    expect(String(moved.values.amount_cents)).toBe('9007199254740993');
  });

  it('FINDING-2 RED: fails closed with a BIGINT-range error past ±9223372036854775807', () => {
    expect(() =>
      mapAccountRow({
        id: 'a-over',
        household_id: household,
        name: 'Over',
        initial_balance_cents: '9223372036854775808',
      }),
    ).toThrow(/BIGINT/i);
    expect(() =>
      mapTransactionRow({
        id: 't-over',
        household_id: household,
        kind: 'expense',
        description: 'Over',
        amount_cents: '9223372036854775808',
        date: '2026-09-01',
        from_account_id: 'acc-a',
      }),
    ).toThrow(/BIGINT/i);
  });
});
