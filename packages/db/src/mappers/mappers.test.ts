// ─────────────────────────────────────────────────────────────────────────────
// Mapper Tests - Domain Entity <-> DB Row
// ─────────────────────────────────────────────────────────────────────────────

import { describe, expect, test } from 'vitest';
import { toDbAccount, fromDbAccount } from './account.js';
import { toDbCategory, fromDbCategory, toDbCategoryAlias, fromDbCategoryAlias } from './category.js';
import { toDbFinancialRecord, fromDbFinancialRecord } from './financial-record.js';
import { toDbLedgerEntry, fromDbLedgerEntry } from './ledger.js';
import { toDbIdempotencyKey, fromDbIdempotencyKey } from './idempotency.js';
import { toDbHousehold, fromDbHousehold } from './household.js';
import { toDbAuditLog, fromDbAuditLog } from './audit-log.js';
import { toDbCreditCard, fromDbCreditCard } from './credit-card.js';
import { toDbInvoice, fromDbInvoice } from './invoice.js';
import { toDbInstallmentGroup, fromDbInstallmentGroup } from './installment-group.js';
import type { Account } from '@pi-financeiro/domain';

// ─────────────────────────────────────────────────────────────────────────────
// Test Fixtures
// ─────────────────────────────────────────────────────────────────────────────

function createTestAccount(overrides?: Partial<Account>): Account {
  const now = '2026-05-29T10:00:00.000Z';
  return {
    id: '0192a1b3-0000-0000-0000-000000000001',
    householdId: '0192a1b3-0000-0000-0000-000000000000',
    name: 'Conta Corrente',
    type: 'checking',
    ownerUserId: null,
    scope: 'shared',
    initialBalanceCents: 100000,
    active: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Account Mapper Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('Account Mapper', () => {
  test('toDbAccount maps domain entity to DB row', () => {
    const account = createTestAccount();
    const dbRow = toDbAccount(account);
    
    expect(dbRow.id).toBe(account.id);
    expect(dbRow.householdId).toBe(account.householdId);
    expect(dbRow.name).toBe(account.name);
    expect(dbRow.type).toBe('checking');
    expect(dbRow.scope).toBe('shared');
    expect(dbRow.initialBalanceCents).toBe(100000);
    expect(dbRow.active).toBe(true);
  });
  
  test('toDbAccount handles all account types', () => {
    const types: Account['type'][] = ['checking', 'savings', 'credit', 'investment', 'cash'];
    types.forEach(type => {
      const account = createTestAccount({ type });
      const dbRow = toDbAccount(account);
      expect(dbRow.type).toBe(type);
    });
  });
  
  test('fromDbAccount maps DB row to domain entity', () => {
    const dbRow = {
      id: '0192a1b3-0000-0000-0000-000000000001',
      householdId: '0192a1b3-0000-0000-0000-000000000000',
      name: 'Poupança',
      type: 'savings' as const,
      ownerUserId: null,
      scope: 'personal' as const,
      initialBalanceCents: 50000,
      active: true,
      createdAt: new Date('2026-05-29T10:00:00.000Z'),
      updatedAt: new Date('2026-05-29T10:00:00.000Z'),
    };
    
    const account = fromDbAccount(dbRow);
    
    expect(account.id).toBe(dbRow.id);
    expect(account.householdId).toBe(dbRow.householdId);
    expect(account.name).toBe(dbRow.name);
    expect(account.type).toBe('savings');
    expect(account.scope).toBe('personal');
    expect(account.initialBalanceCents).toBe(50000);
    expect(account.active).toBe(true);
  });
  
  test('fromDbAccount handles ISO datetime strings', () => {
    const dbRow = {
      id: '0192a1b3-0000-0000-0000-000000000001',
      householdId: '0192a1b3-0000-0000-0000-000000000000',
      name: 'Test',
      type: 'checking' as const,
      ownerUserId: null,
      scope: 'shared' as const,
      initialBalanceCents: 0,
      active: true,
      createdAt: new Date('2026-05-29T10:00:00.000Z'),
      updatedAt: new Date('2026-05-29T10:00:00.000Z'),
    };
    
    const account = fromDbAccount(dbRow);
    
    expect(account.createdAt).toBe('2026-05-29T10:00:00.000Z');
    expect(account.updatedAt).toBe('2026-05-29T10:00:00.000Z');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Category Mapper Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('Category Mapper', () => {
  test('toDbCategory maps domain to DB row', () => {
    const category = {
      id: '0192a1b3-0000-0000-0000-000000000001',
      householdId: '0192a1b3-0000-0000-0000-000000000000',
      name: 'Alimentação',
      parentId: null,
      kind: 'expense' as const,
      normalizedName: 'alimentacao',
      active: true,
      createdAt: '2026-05-29T10:00:00.000Z',
      updatedAt: '2026-05-29T10:00:00.000Z',
    };
    
    const dbRow = toDbCategory(category);
    
    expect(dbRow.id).toBe(category.id);
    expect(dbRow.name).toBe(category.name);
    expect(dbRow.kind).toBe('expense');
    expect(dbRow.normalizedName).toBe('alimentacao');
  });
  
  test('fromDbCategory maps DB row to domain', () => {
    const dbRow = {
      id: '0192a1b3-0000-0000-0000-000000000001',
      householdId: '0192a1b3-0000-0000-0000-000000000000',
      name: 'Salário',
      parentId: null,
      kind: 'income' as const,
      normalizedName: 'salario',
      active: true,
      createdAt: new Date('2026-05-29T10:00:00.000Z'),
      updatedAt: new Date('2026-05-29T10:00:00.000Z'),
    };
    
    const category = fromDbCategory(dbRow);
    
    expect(category.id).toBe(dbRow.id);
    expect(category.name).toBe(dbRow.name);
    expect(category.kind).toBe('income');
  });
  
  test('toDbCategoryAlias maps domain to DB row', () => {
    const alias = {
      id: '0192a1b3-0000-0000-0000-000000000002',
      householdId: '0192a1b3-0000-0000-0000-000000000000',
      categoryId: '0192a1b3-0000-0000-0000-000000000001',
      alias: 'Mercado',
      createdAt: '2026-05-29T10:00:00.000Z',
    };
    
    const dbRow = toDbCategoryAlias(alias);
    
    expect(dbRow.categoryId).toBe(alias.categoryId);
    expect(dbRow.alias).toBe('Mercado');
  });
  
  test('fromDbCategoryAlias maps DB row to domain', () => {
    const dbRow = {
      id: '0192a1b3-0000-0000-0000-000000000002',
      householdId: '0192a1b3-0000-0000-0000-000000000000',
      categoryId: '0192a1b3-0000-0000-0000-000000000001',
      alias: 'Supermercado',
      createdAt: new Date('2026-05-29T10:00:00.000Z'),
    };
    
    const alias = fromDbCategoryAlias(dbRow);
    
    expect(alias.alias).toBe('Supermercado');
    expect(alias.categoryId).toBe(dbRow.categoryId);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Financial Record Mapper Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('Financial Record Mapper', () => {
  test('toDbFinancialRecord maps expense record', () => {
    const record = {
      id: '0192a1b3-0000-0000-0000-000000000001',
      householdId: '0192a1b3-0000-0000-0000-000000000000',
      type: 'expense' as const,
      amountCents: 5000,
      date: '2026-05-29T10:00:00.000Z',
      description: 'Mercado',
      accountId: '0192a1b3-0000-0000-0000-000000000010',
      fromAccountId: null,
      toAccountId: null,
      cardId: null,
      invoiceId: null,
      categoryId: '0192a1b3-0000-0000-0000-000000000020',
      createdByUserId: null,
      source: 'dashboard' as const,
      sourceMessageId: null,
      idempotencyKey: null,
      status: 'posted' as const,
      recurrenceId: null,
      installmentGroupId: null,
      relatedRecordId: null,
      merchantId: null,
      confirmedAt: null,
      metadataJson: null,
      createdAt: '2026-05-29T10:00:00.000Z',
      updatedAt: '2026-05-29T10:00:00.000Z',
    };
    
    const dbRow = toDbFinancialRecord(record);
    
    expect(dbRow.id).toBe(record.id);
    expect(dbRow.type).toBe('expense');
    expect(dbRow.amountCents).toBe(5000);
    expect(dbRow.accountId).toBe(record.accountId);
    expect(dbRow.categoryId).toBe(record.categoryId);
  });
  
  test('toDbFinancialRecord maps transfer record with both accounts', () => {
    const record = {
      id: '0192a1b3-0000-0000-0000-000000000002',
      householdId: '0192a1b3-0000-0000-0000-000000000000',
      type: 'transfer' as const,
      amountCents: 10000,
      date: '2026-05-29T10:00:00.000Z',
      description: 'Pix para poupança',
      accountId: null,
      fromAccountId: '0192a1b3-0000-0000-0000-000000000010',
      toAccountId: '0192a1b3-0000-0000-0000-000000000011',
      cardId: null,
      invoiceId: null,
      categoryId: null,
      createdByUserId: null,
      source: 'dashboard' as const,
      sourceMessageId: null,
      idempotencyKey: null,
      status: 'posted' as const,
      recurrenceId: null,
      installmentGroupId: null,
      relatedRecordId: null,
      merchantId: null,
      confirmedAt: null,
      metadataJson: null,
      createdAt: '2026-05-29T10:00:00.000Z',
      updatedAt: '2026-05-29T10:00:00.000Z',
    };
    
    const dbRow = toDbFinancialRecord(record);
    
    expect(dbRow.fromAccountId).toBe(record.fromAccountId);
    expect(dbRow.toAccountId).toBe(record.toAccountId);
  });
  
  test('fromDbFinancialRecord maps all fields', () => {
    const dbRow = {
      id: '0192a1b3-0000-0000-0000-000000000001',
      householdId: '0192a1b3-0000-0000-0000-000000000000',
      type: 'income' as const,
      amountCents: 10000,
      date: new Date('2026-05-29T10:00:00.000Z'),
      description: 'Salário',
      accountId: '0192a1b3-0000-0000-0000-000000000010',
      fromAccountId: null,
      toAccountId: null,
      cardId: null,
      invoiceId: null,
      categoryId: null,
      createdByUserId: null,
      source: 'whatsapp' as const,
      sourceMessageId: null,
      idempotencyKey: null,
      status: 'posted' as const,
      recurrenceId: null,
      installmentGroupId: null,
      relatedRecordId: null,
      merchantId: null,
      confirmedAt: null,
      metadataJson: null,
      createdAt: new Date('2026-05-29T10:00:00.000Z'),
      updatedAt: new Date('2026-05-29T10:00:00.000Z'),
    };
    
    const record = fromDbFinancialRecord(dbRow);
    
    expect(record.id).toBe(dbRow.id);
    expect(record.type).toBe('income');
    expect(record.amountCents).toBe(10000);
    expect(record.source).toBe('whatsapp');
    expect(record.status).toBe('posted');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Ledger Mapper Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('Ledger Mapper', () => {
  test('toDbLedgerEntry maps debit entry', () => {
    const entry = {
      id: '0192a1b3-0000-0000-0000-000000000001',
      householdId: '0192a1b3-0000-0000-0000-000000000000',
      recordId: '0192a1b3-0000-0000-0000-000000000010',
      accountId: '0192a1b3-0000-0000-0000-000000000020',
      cardId: null,
      invoiceId: null,
      direction: 'debit' as const,
      amountCents: 5000,
      effectiveDate: '2026-05-29T10:00:00.000Z',
      entryType: 'cash' as const,
      createdAt: '2026-05-29T10:00:00.000Z',
    };
    
    const dbRow = toDbLedgerEntry(entry);
    
    expect(dbRow.recordId).toBe(entry.recordId);
    expect(dbRow.direction).toBe('debit');
    expect(dbRow.amountCents).toBe(5000);
    expect(dbRow.entryType).toBe('cash');
  });
  
  test('fromDbLedgerEntry maps credit entry', () => {
    const dbRow = {
      id: '0192a1b3-0000-0000-0000-000000000001',
      householdId: '0192a1b3-0000-0000-0000-000000000000',
      recordId: '0192a1b3-0000-0000-0000-000000000010',
      accountId: '0192a1b3-0000-0000-0000-000000000020',
      cardId: null,
      invoiceId: null,
      direction: 'credit' as const,
      amountCents: 5000,
      effectiveDate: new Date('2026-05-29T10:00:00.000Z'),
      entryType: 'cash' as const,
      createdAt: new Date('2026-05-29T10:00:00.000Z'),
    };
    
    const entry = fromDbLedgerEntry(dbRow);
    
    expect(entry.direction).toBe('credit');
    expect(entry.amountCents).toBe(5000);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Idempotency Mapper Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('Idempotency Mapper', () => {
  test('toDbIdempotencyKey maps domain to DB row', () => {
    const key = {
      id: '0192a1b3-0000-0000-0000-000000000001',
      householdId: '0192a1b3-0000-0000-0000-000000000000',
      key: 'unique-key-123',
      scope: 'whatsapp',
      createdAt: '2026-05-29T10:00:00.000Z',
      expiresAt: null,
    };
    
    const dbRow = toDbIdempotencyKey(key);
    
    expect(dbRow.key).toBe('unique-key-123');
    expect(dbRow.scope).toBe('whatsapp');
  });
  
  test('fromDbIdempotencyKey maps DB row to domain', () => {
    const dbRow = {
      id: '0192a1b3-0000-0000-0000-000000000001',
      householdId: '0192a1b3-0000-0000-0000-000000000000',
      key: 'another-key',
      scope: 'api',
      createdAt: new Date('2026-05-29T10:00:00.000Z'),
      expiresAt: null,
    };
    
    const key = fromDbIdempotencyKey(dbRow);
    
    expect(key.key).toBe('another-key');
    expect(key.scope).toBe('api');
  });
  
  test('fromDbIdempotencyKey handles expires_at', () => {
    const dbRow = {
      id: '0192a1b3-0000-0000-0000-000000000001',
      householdId: '0192a1b3-0000-0000-0000-000000000000',
      key: 'temp-key',
      scope: 'session',
      createdAt: new Date('2026-05-29T10:00:00.000Z'),
      expiresAt: new Date('2026-06-29T10:00:00.000Z'),
    };
    
    const key = fromDbIdempotencyKey(dbRow);
    
    expect(key.expiresAt).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Household Mapper Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('Household Mapper', () => {
  test('toDbHousehold maps domain entity to DB row', () => {
    const household = {
      id: '0192a1b3-0000-0000-0000-000000000001',
      name: 'Casa',
      currency: 'BRL',
      timezone: 'America/Sao_Paulo',
      createdAt: '2026-05-29T10:00:00.000Z',
      updatedAt: '2026-05-29T10:00:00.000Z',
    };
    
    const dbRow = toDbHousehold(household);
    
    expect(dbRow.id).toBe(household.id);
    expect(dbRow.name).toBe('Casa');
    expect(dbRow.currency).toBe('BRL');
    expect(dbRow.timezone).toBe('America/Sao_Paulo');
  });
  
  test('fromDbHousehold maps DB row to domain entity', () => {
    const dbRow = {
      id: '0192a1b3-0000-0000-0000-000000000001',
      name: 'Escritório',
      currency: 'BRL' as const,
      timezone: 'America/Sao_Paulo' as const,
      highValueThresholdCents: 50000,
      createdAt: new Date('2026-05-29T10:00:00.000Z'),
      updatedAt: new Date('2026-05-29T10:00:00.000Z'),
    };
    
    const household = fromDbHousehold(dbRow);
    
    expect(household.id).toBe(dbRow.id);
    expect(household.name).toBe('Escritório');
    expect(household.currency).toBe('BRL');
    expect(household.createdAt).toBe('2026-05-29T10:00:00.000Z');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Audit Log Mapper Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('Audit Log Mapper', () => {
  test('toDbAuditLog maps domain entity to DB row', () => {
    const log = {
      id: '0192a1b3-0000-0000-0000-000000000001',
      householdId: '0192a1b3-0000-0000-0000-000000000000',
      actorUserId: null,
      action: 'create' as const,
      entityType: 'financial_record' as const,
      entityId: '0192a1b3-0000-0000-0000-000000000010',
      beforeJson: null,
      afterJson: { amount: 5000 },
      source: 'dashboard' as const,
      createdAt: '2026-05-29T10:00:00.000Z',
    };
    
    const dbRow = toDbAuditLog(log);
    
    expect(dbRow.action).toBe('create');
    expect(dbRow.entityType).toBe('financial_record');
    expect(dbRow.afterJson).toEqual({ amount: 5000 });
  });
  
  test('fromDbAuditLog maps DB row to domain entity', () => {
    const dbRow = {
      id: '0192a1b3-0000-0000-0000-000000000001',
      householdId: '0192a1b3-0000-0000-0000-000000000000',
      actorUserId: null,
      action: 'update' as const,
      entityType: 'account' as const,
      entityId: '0192a1b3-0000-0000-0000-000000000010',
      beforeJson: { name: 'Old' },
      afterJson: { name: 'New' },
      source: 'dashboard' as const,
      createdAt: new Date('2026-05-29T10:00:00.000Z'),
    };
    
    const log = fromDbAuditLog(dbRow);
    
    expect(log.action).toBe('update');
    expect(log.entityType).toBe('account');
    expect(log.afterJson).toEqual({ name: 'New' });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Credit Card Mapper Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('Credit Card Mapper', () => {
  test('toDbCreditCard maps domain entity to DB row', () => {
    const card = {
      id: '0192a1b3-0000-0000-0000-000000000001',
      householdId: '0192a1b3-0000-0000-0000-000000000000',
      name: 'Nubank',
      ownerUserId: null,
      scope: 'shared' as const,
      limitCents: 100000,
      closingDay: 20,
      dueDay: 27,
      paymentAccountId: null,
      active: true,
      createdAt: '2026-05-29T10:00:00.000Z',
      updatedAt: '2026-05-29T10:00:00.000Z',
    };
    
    const dbRow = toDbCreditCard(card);
    
    expect(dbRow.name).toBe('Nubank');
    expect(dbRow.closingDay).toBe(20);
    expect(dbRow.scope).toBe('shared');
  });
  
  test('fromDbCreditCard maps DB row to domain entity', () => {
    const dbRow = {
      id: '0192a1b3-0000-0000-0000-000000000001',
      householdId: '0192a1b3-0000-0000-0000-000000000000',
      name: 'Inter',
      ownerUserId: null,
      scope: 'personal' as const,
      limitCents: 50000,
      closingDay: 15,
      dueDay: 22,
      paymentAccountId: null,
      active: true,
      createdAt: new Date('2026-05-29T10:00:00.000Z'),
      updatedAt: new Date('2026-05-29T10:00:00.000Z'),
    };
    
    const card = fromDbCreditCard(dbRow);
    
    expect(card.name).toBe('Inter');
    expect(card.scope).toBe('personal');
    expect(card.limitCents).toBe(50000);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Invoice Mapper Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('Invoice Mapper', () => {
  test('toDbInvoice maps domain entity to DB row', () => {
    const invoice = {
      id: '0192a1b3-0000-0000-0000-000000000001',
      householdId: '0192a1b3-0000-0000-0000-000000000000',
      cardId: '0192a1b3-0000-0000-0000-000000000010',
      periodMonth: 5,
      periodYear: 2026,
      status: 'open' as const,
      closesAt: '2026-05-20T12:00:00.000Z',
      dueAt: '2026-05-27T12:00:00.000Z',
      totalCents: 0,
      paidAt: null,
      createdAt: '2026-05-29T10:00:00.000Z',
      updatedAt: '2026-05-29T10:00:00.000Z',
    };
    
    const dbRow = toDbInvoice(invoice);
    
    expect(dbRow.periodMonth).toBe(5);
    expect(dbRow.periodYear).toBe(2026);
    expect(dbRow.status).toBe('open');
  });
  
  test('fromDbInvoice maps DB row to domain entity', () => {
    const dbRow = {
      id: '0192a1b3-0000-0000-0000-000000000001',
      householdId: '0192a1b3-0000-0000-0000-000000000000',
      cardId: '0192a1b3-0000-0000-0000-000000000010',
      periodMonth: 4,
      periodYear: 2026,
      status: 'closed' as const,
      closesAt: new Date('2026-04-20T12:00:00.000Z'),
      dueAt: new Date('2026-04-27T12:00:00.000Z'),
      totalCents: 15000,
      paidAt: new Date('2026-04-27T12:00:00.000Z'),
      createdAt: new Date('2026-05-29T10:00:00.000Z'),
      updatedAt: new Date('2026-05-29T10:00:00.000Z'),
    };
    
    const invoice = fromDbInvoice(dbRow);
    
    expect(invoice.status).toBe('closed');
    expect(invoice.totalCents).toBe(15000);
    expect(invoice.paidAt).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Installment Group Mapper Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('Installment Group Mapper', () => {
  test('toDbInstallmentGroup maps domain entity to DB row', () => {
    const group = {
      id: '0192a1b3-0000-0000-0000-000000000001',
      householdId: '0192a1b3-0000-0000-0000-000000000000',
      description: 'Tênis Nike',
      totalCents: 30000,
      installmentsCount: 3,
      firstDate: '2026-05-10T12:00:00.000Z',
      cardId: '0192a1b3-0000-0000-0000-000000000010',
      accountId: null,
      createdAt: '2026-05-29T10:00:00.000Z',
    };
    
    const dbRow = toDbInstallmentGroup(group);
    
    expect(dbRow.description).toBe('Tênis Nike');
    expect(dbRow.installmentsCount).toBe(3);
    expect(dbRow.totalCents).toBe(30000);
  });
  
  test('fromDbInstallmentGroup maps DB row to domain entity', () => {
    const dbRow = {
      id: '0192a1b3-0000-0000-0000-000000000001',
      householdId: '0192a1b3-0000-0000-0000-000000000000',
      description: 'TV Samsung',
      totalCents: 120000,
      installmentsCount: 10,
      firstDate: new Date('2026-03-01T12:00:00.000Z'),
      cardId: null,
      accountId: '0192a1b3-0000-0000-0000-000000000010',
      createdAt: new Date('2026-05-29T10:00:00.000Z'),
    };
    
    const group = fromDbInstallmentGroup(dbRow);
    
    expect(group.description).toBe('TV Samsung');
    expect(group.installmentsCount).toBe(10);
    expect(group.accountId).toBeTruthy();
  });
});
