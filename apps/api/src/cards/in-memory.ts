/**
 * In-memory implementation of CardStore.
 *
 * Works with the same InMemoryState used by the rest of the app.
 * Statement IDs use deterministic UUIDs based on cycle+account so
 * multiple purchases in the same cycle find the same statement.
 */

import { randomUUID, createHash } from 'node:crypto';
import type { Account, Transaction, Statement, StatementDetail, StatementPurchase, RecurringPurchase } from '../types/domain.js';
import type { CardStore } from './store.js';
import type { InMemoryState } from '../writes/in-memory.js';
import { domainErrors } from '../writes/errors.js';

function stableId(prefix: string, accountId: string, cycle: string): string {
  const h = createHash('sha256').update(`${prefix}:${accountId}:${cycle}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

function getClosingDate(purchaseDate: string, closingDay: number): string {
  const d = new Date(purchaseDate + 'T00:00:00.000Z');
  let y = d.getUTCFullYear();
  let m = d.getUTCMonth();
  if (d.getUTCDate() > closingDay) { m += 1; if (m > 11) { m = 0; y += 1; } }
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const day = Math.min(closingDay, lastDay);
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function getDueDate(closingDate: string, dueDay: number): string {
  const d = new Date(closingDate + 'T00:00:00.000Z');
  let y = d.getUTCFullYear();
  let m = d.getUTCMonth();
  const cDay = d.getUTCDate();
  if (dueDay <= cDay) { m += 1; if (m > 11) { m = 0; y += 1; } }
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const day = Math.min(dueDay, lastDay);
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function cycleYearMonth(closingDate: string): string {
  return closingDate.slice(0, 7);
}

function computeStatus(s: Statement, today: string): Statement['status'] {
  if (s.status === 'cancelled') return 'cancelled';
  if (s.paidCents >= s.totalCents) return 'paid';
  if (s.paidCents > 0 && today > s.dueDate) return 'overdue';
  if (s.paidCents > 0) return 'partial';
  if (today > s.dueDate) return 'overdue';
  if (today >= s.closingDate) return 'closed';
  return 'open';
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Helper: spread conditional optional properties to satisfy exactOptionalPropertyTypes. */
function opt<T extends Record<string, unknown>>(obj: T, props: Partial<T>): T {
  const result = { ...obj };
  for (const [k, v] of Object.entries(props)) {
    if (v !== undefined && v !== null) (result as any)[k] = v;
  }
  return result;
}

export const createInMemoryCardStore = (state: InMemoryState): CardStore => {
  // Ensure state has card-specific containers.
  if (!(state as any)._statements) (state as any)._statements = [] as Statement[];
  if (!(state as any)._recurring) (state as any)._recurring = [] as RecurringPurchase[];
  const statements = (state as any)._statements as Statement[];
  const recurring = (state as any)._recurring as RecurringPurchase[];

  const findAccount = (id: string, householdId: string): Account => {
    const a = state.accounts.find(x => x.id === id && x.householdId === householdId);
    if (!a) throw domainErrors.notFound('Conta');
    if (a.status !== 'active') throw domainErrors.notFound('Conta');
    if (a.kind !== 'credit_card') throw domainErrors.invalid('accountId', 'não é cartão de crédito');
    return a;
  };

  const findOrCreateStatement = (accountId: string, householdId: string, purchaseDate: string, card: Account): Statement => {
    if (!card.closingDay || !card.dueDay) throw domainErrors.invalid('accountId', 'cartão sem fechamento/vencimento configurado');
    const closing = getClosingDate(purchaseDate, card.closingDay);
    const cycle = cycleYearMonth(closing);
    let s = statements.find(x => x.accountId === accountId && x.cycleYearMonth === cycle);
    if (s) return s;

    const due = getDueDate(closing, card.dueDay);
    s = {
      id: stableId('stmt', accountId, cycle),
      householdId,
      accountId,
      cycleYearMonth: cycle,
      closingDate: closing,
      dueDate: due,
      totalCents: 0,
      paidCents: 0,
      status: 'open',
    };
    statements.push(s);
    return s;
  };

  const recalcTotal = (statementId: string): void => {
    const stmt = statements.find(s => s.id === statementId);
    if (!stmt) return;
    const total = state.transactions
      .filter(t => (t as any).statementId === statementId && !state.deletedTransactions.has(t.id))
      .reduce((sum, t) => sum + t.amountCents, 0);
    stmt.totalCents = total;
    stmt.status = computeStatus(stmt, todayISO());
  };

  return {
    async listCreditCardAccounts(householdId) {
      return state.accounts.filter(a => a.householdId === householdId && a.kind === 'credit_card' && a.status === 'active');
    },

    async listStatements(householdId, accountId, opts) {
      let list = statements.filter(s => s.householdId === householdId);
      if (accountId) list = list.filter(s => s.accountId === accountId);
      if (opts?.status) list = list.filter(s => s.status === opts.status);
      list.sort((a, b) => b.closingDate.localeCompare(a.closingDate));
      if (opts?.limit) list = list.slice(0, opts.limit);
      return list;
    },

    async getStatementDetail(householdId, statementId) {
      const s = statements.find(x => x.id === statementId && x.householdId === householdId);
      if (!s) return null;

      const purchases: StatementPurchase[] = state.transactions
        .filter(t => (t as any).statementId === statementId && !state.deletedTransactions.has(t.id))
        .sort((a, b) => a.date.localeCompare(b.date))
        .map(t => {
          const instNum = (t as any).installmentNumber;
          const instTotal = (t as any).installmentsTotal;
          return opt<StatementPurchase>(
            { id: t.id, description: t.description, amountCents: t.amountCents, date: t.date, isRecurring: false },
            {
              ...(instNum != null ? { installmentNumber: instNum as number } : {}),
              ...(instTotal != null ? { installmentsTotal: instTotal as number } : {}),
            } as Partial<StatementPurchase>,
          );
        });

      return { ...s, purchases };
    },

    async createCardPurchase(householdId, input) {
      const card = findAccount(input.accountId, householdId);
      const stmt = findOrCreateStatement(input.accountId, householdId, input.date, card);

      const tx = opt<Transaction & { statementId: string }>(
        {
          id: randomUUID(), householdId, kind: 'expense' as const,
          description: input.description, amountCents: input.amountCents,
          date: input.date, accountId: input.accountId,
          statementId: stmt.id,
        },
        {
          categoryId: input.categoryId,
          ...(input.installmentsTotal != null ? { installmentsTotal: input.installmentsTotal } as any : {}),
          ...(input.installmentNumber != null ? { installmentNumber: input.installmentNumber } as any : {}),
        } as any,
      );
      state.transactions.push(tx);
      recalcTotal(stmt.id);
      return [tx];
    },

    async createCardInstallments(householdId, input) {
      const card = findAccount(input.accountId, householdId);
      const baseValue = Math.floor(input.totalAmountCents / input.installmentsTotal);
      const remainder = input.totalAmountCents - baseValue * input.installmentsTotal;
      const txs: Transaction[] = [];
      const date = new Date(input.purchaseDate + 'T00:00:00.000Z');

      for (let i = 0; i < input.installmentsTotal; i++) {
        const instDate = new Date(date);
        instDate.setUTCMonth(instDate.getUTCMonth() + i);
        const dateStr = instDate.toISOString().slice(0, 10);
        const amount = i === input.installmentsTotal - 1 ? baseValue + remainder : baseValue;

        const stmt = findOrCreateStatement(input.accountId, householdId, dateStr, card);
        const tx = opt<Transaction & { statementId: string; installmentsTotal: number; installmentNumber: number }>(
          {
            id: randomUUID(), householdId, kind: 'expense' as const,
            description: input.description, amountCents: amount,
            date: dateStr, accountId: input.accountId,
            statementId: stmt.id,
            installmentsTotal: input.installmentsTotal,
            installmentNumber: i + 1,
          },
          { categoryId: input.categoryId } as any,
        );
        state.transactions.push(tx);
        txs.push(tx);
        recalcTotal(stmt.id);
      }
      return txs;
    },

    async createRecurringPurchase(householdId, input) {
      findAccount(input.accountId, householdId);
      const r = opt<RecurringPurchase>(
        {
          id: randomUUID(), householdId, accountId: input.accountId,
          description: input.description, amountCents: input.amountCents,
          frequency: input.frequency, startDate: input.startDate,
          status: 'active' as const,
        },
        { endDate: input.endDate, categoryId: input.categoryId } as Partial<RecurringPurchase>,
      );
      recurring.push(r);
      return r;
    },

    async payStatement(householdId, statementId, input) {
      const s = statements.find(x => x.id === statementId && x.householdId === householdId);
      if (!s) throw domainErrors.notFound('Fatura');

      // Validate source account is not a credit card
      const from = state.accounts.find(a => a.id === input.fromAccountId && a.householdId === householdId);
      if (!from) throw domainErrors.notFound('Conta de origem');
      if (from.kind === 'credit_card') throw domainErrors.invalid('fromAccountId', 'não pode pagar fatura com cartão de crédito');

      // Deduct from source account
      if (from.balanceCents < input.amountCents) throw domainErrors.invalid('amountCents', 'saldo insuficiente na conta de origem');
      from.balanceCents -= input.amountCents;

      // Apply to statement
      s.paidCents += input.amountCents;
      s.status = computeStatus(s, todayISO());

      // Create payment transaction (transfer-like, from source to the card's "balance")
      const card = state.accounts.find(a => a.id === s.accountId);
      if (card) card.balanceCents += input.amountCents;

      return s;
    },
  };
};
