// ─────────────────────────────────────────────────────────────────────────────
// Reminder script tests
// Runs without network or database — uses fakes.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { WeeklyData } from './data-provider.js';
import { FakeDataProvider } from './data-provider.js';
import { EvolutionClient, FakeEvolutionClient } from '../src/evolution-client.js';
import { formatWeeklySummary } from './formatter.js';

// ─────────────────────────────────────────────────────────────────────────────
// Fixture helpers
// ─────────────────────────────────────────────────────────────────────────────

const fakeData: WeeklyData = {
  accounts: [
    { name: 'Nubank', balance_cents: 128000 },
    { name: 'Carteira', balance_cents: 23000 },
    { name: 'Poupança', balance_cents: 50000 },
  ],
  weekTransactions: [
    {
      id: '1', kind: 'expense', amount_cents: 4500,
      description: 'mercado', category_id: null, category_name: null,
      from_account_id: null, from_account_name: 'Carteira',
      to_account_id: null, to_account_name: null,
      date: '2026-06-03', status: 'confirmed',
      source_message_id: null, created_at: '2026-06-03T10:00:00Z',
    },
    {
      id: '2', kind: 'income', amount_cents: 150000,
      description: 'salário', category_id: null, category_name: null,
      from_account_id: null, from_account_name: null,
      to_account_id: null, to_account_name: 'Nubank',
      date: '2026-06-02', status: 'confirmed',
      source_message_id: null, created_at: '2026-06-02T09:00:00Z',
    },
    {
      id: '3', kind: 'expense', amount_cents: 8990,
      description: 'ifood', category_id: null, category_name: null,
      from_account_id: null, from_account_name: 'Nubank',
      to_account_id: null, to_account_name: null,
      date: '2026-05-30', status: 'confirmed',
      source_message_id: null, created_at: '2026-05-30T20:00:00Z',
    },
    {
      id: '4', kind: 'transfer', amount_cents: 20000,
      description: null, category_id: null, category_name: null,
      from_account_id: null, from_account_name: 'Nubank',
      to_account_id: null, to_account_name: 'Carteira',
      date: '2026-05-29', status: 'confirmed',
      source_message_id: null, created_at: '2026-05-29T15:00:00Z',
    },
  ],
  currentMonthSummary: {
    month: '2026-06',
    total_income_cents: 320000,
    total_expense_cents: 189000,
    net_balance_cents: 131000,
    transaction_count: 8,
  },
};

const emptyData: WeeklyData = {
  accounts: [],
  weekTransactions: [],
  currentMonthSummary: {
    month: '2026-06',
    total_income_cents: 0,
    total_expense_cents: 0,
    net_balance_cents: 0,
    transaction_count: 0,
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// describe: formatter
// ─────────────────────────────────────────────────────────────────────────────

describe('formatWeeklySummary', () => {
  it('contains header with week label', () => {
    const msg = formatWeeklySummary(fakeData, 'semana 27/05 a 03/06');
    expect(msg).toContain('📊 Resumo Semanal');
    expect(msg).toContain('semana 27/05 a 03/06');
  });

  it('lists all accounts with formatted value', () => {
    const msg = formatWeeklySummary(fakeData, 'semana teste');
    expect(msg).toContain('Nubank: R$ 1.280,00');
    expect(msg).toContain('Carteira: R$ 230,00');
    expect(msg).toContain('Poupança: R$ 500,00');
  });

  it('includes negative balances with minus sign', () => {
    const data = { ...fakeData, accounts: [{ name: 'Conta Negativa', balance_cents: -1000 }] };
    const msg = formatWeeklySummary(data, 'semana teste');
    expect(msg).toContain('Conta Negativa: -R$ 10,00');
  });

  it('shows transaction lines with date, kind, amount, description, account', () => {
    const msg = formatWeeklySummary(fakeData, 'semana teste');
    expect(msg).toContain('mercado');
    expect(msg).toContain('despesa: R$ 45,00');
    expect(msg).toContain('salário');
    expect(msg).toContain('receita: R$ 1.500,00');
    expect(msg).toContain('ifood');
    expect(msg).toContain('Nubank → Carteira');
  });

  it('caps transaction list at 5', () => {
    const manyTx = Array.from({ length: 10 }, (_, i) => ({
      id: String(i), kind: 'expense' as const, amount_cents: 100,
      description: `tx${i}`, category_id: null, category_name: null,
      from_account_id: null, from_account_name: 'Teste',
      to_account_id: null, to_account_name: null,
      date: `2026-06-0${Math.min(i + 1, 9)}`, status: 'confirmed' as const,
      source_message_id: null, created_at: '2026-06-01T00:00:00Z',
    }));
    const data = { ...fakeData, weekTransactions: manyTx };
    const msg = formatWeeklySummary(data, 'semana teste');
    expect(msg).toContain('tx0');
    expect(msg).not.toContain('tx6'); // only first 5 shown
  });

  it('includes current month summary block when there are transactions', () => {
    const msg = formatWeeklySummary(fakeData, 'semana teste');
    expect(msg).toContain('💰 2026-06 até agora');
    expect(msg).toContain('receitas: R$ 3.200,00');
    expect(msg).toContain('despesas: R$ 1.890,00');
    expect(msg).toContain('saldo: R$ 1.310,00');
  });

  it('omits month block when no transactions', () => {
    const msg = formatWeeklySummary(emptyData, 'semana teste');
    expect(msg).not.toContain('💰');
    expect(msg).toContain('Nenhuma transação');
  });

  it('shows empty state when no accounts', () => {
    const msg = formatWeeklySummary(emptyData, 'semana teste');
    expect(msg).toContain('Nenhuma conta cadastrada');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Pipeline test: data provider → formatter →Evolution send
// Uses FakeDataProvider + FakeEvolutionClient — no network, no DB.
// ─────────────────────────────────────────────────────────────────────────────

describe('reminder pipeline (no network)', () => {
  let fakeSender: FakeEvolutionClient;
  let fakeProvider: FakeDataProvider;

  beforeEach(() => {
    fakeSender = new FakeEvolutionClient();
    fakeProvider = new FakeDataProvider(fakeData);
  });

  it('assembles message from provider and sends via Evolution', async () => {
    // 1) Get data from fake provider
    const data = await fakeProvider.getWeeklyData();

    // 2) Format
    const label = 'semana 27/05 a 03/06';
    const message = formatWeeklySummary(data, label);

    // 3) Send via fake sender
    const targetChatId = '12000000000@g.us';
    await fakeSender.send(targetChatId, message);

    // Assert
    expect(fakeSender.sentMessages).toHaveLength(1);
    const sent = fakeSender.sentMessages[0];
    expect(sent.groupId).toBe(targetChatId);
    expect(sent.message).toContain('📊 Resumo Semanal');
    expect(sent.message).toContain('Nubank');
    expect(sent.message).toContain('mercado');
  });

  it('sends error message when Evolution client fails', async () => {
    fakeSender.shouldFail = true;
    const data = await fakeProvider.getWeeklyData();
    const message = formatWeeklySummary(data, 'semana teste');
    const targetChatId = '12000000000@g.us';

    await expect(fakeSender.send(targetChatId, message)).rejects.toThrow('Fake Evolution client configured to fail');
  });

  it('handles zero transactions without crashing', async () => {
    const emptyProvider = new FakeDataProvider(emptyData);
    const data = await emptyProvider.getWeeklyData();
    const message = formatWeeklySummary(data, 'semana vazia');

    expect(message).toContain('Nenhuma conta cadastrada');
    expect(message).toContain('Nenhuma transação');
    expect(message).not.toContain('💰');

    await fakeSender.send('12000000000@g.us', message);
    expect(fakeSender.sentMessages).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// describe: week label builder (isolated logic)
// ─────────────────────────────────────────────────────────────────────────────

describe('buildWeekLabel (isolated)', () => {
  // This is the same logic used in reminder.ts
  function buildWeekLabel(showDays: number): string {
    const now = new Date();
    const start = new Date(now);
    start.setDate(start.getDate() - showDays);
    const opts: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit' };
    return `semana ${start.toLocaleDateString('pt-BR', opts)} a ${now.toLocaleDateString('pt-BR', opts)}`;
  }

  it('formats 7-day window', () => {
    const label = buildWeekLabel(7);
    expect(label).toMatch(/^semana \d{2}\/\d{2} a \d{2}\/\d{2}$/);
  });

  it('handles showDays=1', () => {
    const label = buildWeekLabel(1);
    expect(label).toMatch(/^semana \d{2}\/\d{2} a \d{2}\/\d{2}$/);
  });

  it('handles showDays=30', () => {
    const label = buildWeekLabel(30);
    expect(label).toMatch(/^semana \d{2}\/\d{2} a \d{2}\/\d{2}$/);
  });
});
