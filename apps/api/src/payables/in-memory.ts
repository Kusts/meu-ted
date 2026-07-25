import { randomUUID } from 'node:crypto';
import type { Payable, PayableTemplate, NotificationConfig, Transaction } from '../types/domain.js';
import type { PayableStore } from './store.js';
import type { InMemoryState } from '../writes/in-memory.js';
import { DomainError, domainErrors } from '../writes/errors.js';

function todayISO(): string { return new Date().toISOString().slice(0, 10); }

function opt<T extends Record<string, unknown>>(obj: T, props: Partial<T>): T {
  const result = { ...obj };
  for (const [k, v] of Object.entries(props)) {
    if (v !== undefined && v !== null) (result as any)[k] = v;
  }
  return result;
}

export const createInMemoryPayableStore = (state: InMemoryState): PayableStore => {
  if (!(state as any)._payables) (state as any)._payables = [] as Payable[];
  if (!(state as any)._templates) (state as any)._templates = [] as PayableTemplate[];
  if (!(state as any)._notifications) (state as any)._notifications = [] as NotificationConfig[];
  const payables = (state as any)._payables as Payable[];
  const templates = (state as any)._templates as PayableTemplate[];
  const notifications = (state as any)._notifications as NotificationConfig[];

  const refreshStatus = (): void => {
    const today = todayISO();
    for (const p of payables) {
      if (p.status === 'pending' && p.dueDate < today) p.status = 'overdue';
    }
  };

  return {
    async listPayables(householdId, filters) {
      refreshStatus();
      let list = payables.filter(p => p.householdId === householdId);
      if (filters?.status) list = list.filter(p => p.status === filters.status);
      if (filters?.type) list = list.filter(p => p.type === filters.type);
      if (filters?.dueWithinDays) {
        const limit = new Date(); limit.setDate(limit.getDate() + filters.dueWithinDays);
        const limitStr = limit.toISOString().slice(0, 10);
        list = list.filter(p => p.status === 'pending' && p.dueDate <= limitStr && p.dueDate >= todayISO());
      }
      list.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
      return list;
    },

    async createPayable(householdId, input) {
      const p = opt<Payable>(
        { id: randomUUID(), householdId, accountId: input.accountId, description: input.description, amountCents: input.amountCents, dueDate: input.dueDate, type: input.type ?? 'one_time', status: 'pending' as const },
        { frequency: input.frequency, endDate: input.endDate, reminderDaysBefore: input.reminderDaysBefore ?? 0, notes: input.notes, categoryId: input.categoryId } as Partial<Payable>,
      );
      payables.push(p);
      return p;
    },

    async markPayablePaid(householdId, payableId, input) {
      const p = payables.find(x => x.id === payableId && x.householdId === householdId);
      if (!p) throw domainErrors.notFound('Conta a pagar');
      p.status = 'paid';
      p.paidDate = input.paidDate ?? todayISO();
      p.paidAmountCents = p.amountCents;
      if (p.type === 'recurring' && p.frequency && !input.prepayMonths) {
        const nextDue = getNextDue(p.dueDate, p.frequency);
        if (nextDue && (!p.endDate || nextDue <= p.endDate)) {
          const next = opt<Payable>(
            { id: randomUUID(), householdId, accountId: p.accountId, description: p.description, amountCents: p.amountCents, dueDate: nextDue, type: 'recurring' as const, frequency: p.frequency, status: 'pending' as const },
            { endDate: p.endDate, reminderDaysBefore: p.reminderDaysBefore, notes: p.notes, categoryId: p.categoryId } as Partial<Payable>,
          );
          payables.push(next);
        }
      }
      if (input.createTransaction !== false) {
        const tx = opt<Transaction>(
          { id: randomUUID(), householdId, kind: 'expense' as const, description: p.description, amountCents: p.amountCents, date: p.paidDate ?? todayISO(), accountId: p.accountId },
          { categoryId: p.categoryId } as Partial<Transaction>,
        );
        state.transactions.push(tx);
        p.paidTransactionId = tx.id;
      }
      return p;
    },

    async undoPayablePayment(householdId, payableId) {
      const p = payables.find(x => x.id === payableId && x.householdId === householdId);
      if (!p) throw domainErrors.notFound('Conta a pagar');
      if (p.status !== 'paid') throw new DomainError('validation.invalid', 'Apenas contas pagas podem ter pagamento desfeito', 409);
      const txId = p.paidTransactionId;
      p.status = todayISO() <= p.dueDate ? 'pending' : 'overdue';
      (p as { paidDate?: string | undefined }).paidDate = undefined;
      (p as { paidAmountCents?: number | undefined }).paidAmountCents = undefined;
      (p as { paidTransactionId?: string | undefined }).paidTransactionId = undefined;
      if (txId) {
        const idx = state.transactions.findIndex((t: Transaction) => t.id === txId);
        if (idx >= 0) state.transactions.splice(idx, 1);
      }
      return p;
    },

    async cancelPayable(householdId, payableId, _reason) {
      const p = payables.find(x => x.id === payableId && x.householdId === householdId);
      if (!p) throw domainErrors.notFound('Conta a pagar');
      p.status = 'cancelled';
      return p;
    },

    async updatePayable(householdId, payableId, input) {
      const p = payables.find(x => x.id === payableId && x.householdId === householdId);
      if (!p) throw domainErrors.notFound('Conta a pagar');
      if (p.status === 'cancelled') throw new DomainError('validation.invalid', 'Conta cancelada não pode ser editada', 409);
      if (input.description !== undefined) p.description = input.description;
      if (input.amountCents !== undefined) p.amountCents = input.amountCents;
      if (input.dueDate !== undefined) p.dueDate = input.dueDate;
      if (input.accountId !== undefined) p.accountId = input.accountId;
      if (input.categoryId !== undefined) p.categoryId = input.categoryId;
      return p;
    },

    async listTemplates(householdId, activeOnly) {
      let list = templates.filter(t => t.householdId === householdId);
      if (activeOnly !== false) list = list.filter(t => t.active);
      return list;
    },

    async createTemplate(householdId, input) {
      const t = opt<PayableTemplate>(
        { id: randomUUID(), householdId, accountId: input.accountId, name: input.name, description: input.description, amountCents: input.amountCents, frequency: input.frequency, dayOfMonth: input.dayOfMonth, active: true },
        { reminderDaysBefore: input.reminderDaysBefore ?? 0, notes: input.notes } as Partial<PayableTemplate>,
      );
      templates.push(t);
      return t;
    },

    async createPayableFromTemplate(householdId, input) {
      const t = input.templateId
        ? templates.find(x => x.id === input.templateId && x.householdId === householdId)
        : templates.find(x => x.name === input.templateName && x.householdId === householdId);
      if (!t) throw domainErrors.notFound('Template');
      return this.createPayable(householdId, {
        accountId: t.accountId, description: t.description, amountCents: input.amountOverrideCents ?? t.amountCents,
        dueDate: input.dueDate, type: 'recurring', frequency: t.frequency,
        ...(t.reminderDaysBefore != null ? { reminderDaysBefore: t.reminderDaysBefore } : {}),
        ...(t.notes ? { notes: t.notes } : {}),
      });
    },

    async listReminders(householdId) {
      refreshStatus();
      const today = todayISO();
      return payables.filter(p => p.householdId === householdId && (p.status === 'overdue' || (p.status === 'pending' && p.dueDate <= today)));
    },

    async listNotifications(householdId) {
      return notifications.filter(n => n.householdId === householdId);
    },

    async configureNotification(householdId, input) {
      const existing = notifications.find(n => n.householdId === householdId && n.chatId === input.chatId && n.notificationType === input.notificationType);
      if (existing) {
        existing.enabled = input.enabled;
        if (input.scheduleHour !== undefined) existing.scheduleHour = input.scheduleHour;
        if (input.scheduleMinute !== undefined) existing.scheduleMinute = input.scheduleMinute;
        if (input.daysOfWeek) existing.daysOfWeek = input.daysOfWeek;
        if (input.thresholdDays !== undefined) existing.thresholdDays = input.thresholdDays;
        return existing;
      }
      const n: NotificationConfig = {
        id: randomUUID(), householdId, chatId: input.chatId,
        notificationType: input.notificationType as NotificationConfig['notificationType'],
        enabled: input.enabled, scheduleHour: input.scheduleHour ?? 9, scheduleMinute: input.scheduleMinute ?? 0,
        daysOfWeek: input.daysOfWeek ?? [1, 2, 3, 4, 5], thresholdDays: input.thresholdDays ?? 1,
      };
      notifications.push(n);
      return n;
    },
  };
};

function getNextDue(currentDue: string, frequency: string): string | null {
  const d = new Date(currentDue + 'T00:00:00');
  switch (frequency) {
    case 'monthly': d.setUTCMonth(d.getUTCMonth() + 1); break;
    case 'quarterly': d.setUTCMonth(d.getUTCMonth() + 3); break;
    case 'yearly': d.setUTCFullYear(d.getUTCFullYear() + 1); break;
    default: return null;
  }
  return d.toISOString().slice(0, 10);
}
