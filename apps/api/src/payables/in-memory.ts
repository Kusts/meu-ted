import { randomUUID } from "node:crypto";
import type {
  NotificationConfig,
  Payable,
  PayableTemplate,
  Transaction,
} from "../types/domain.js";
import { DomainError, domainErrors } from "../writes/errors.js";
import type { InMemoryState } from "../writes/in-memory.js";
import type { PayableStore } from "./store.js";

function todayISO(clock: () => Date = () => new Date()): string {
  return clock().toISOString().slice(0, 10);
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

function nextTemplateDue(dayOfMonth: number, today: Date): string {
  let year = today.getUTCFullYear();
  let month = today.getUTCMonth();
  let candidate = new Date(Date.UTC(year, month, Math.min(dayOfMonth, daysInMonth(year, month))));
  if (candidate < today) {
    month += 1;
    if (month > 11) { month = 0; year += 1; }
    candidate = new Date(Date.UTC(year, month, Math.min(dayOfMonth, daysInMonth(year, month))));
  }
  return candidate.toISOString().slice(0, 10);
}

function opt<T extends Record<string, unknown>>(obj: T, props: Partial<T>): T {
  const result = { ...obj };
  for (const [k, v] of Object.entries(props)) {
    if (v !== undefined && v !== null) (result as any)[k] = v;
  }
  return result;
}

export const createInMemoryPayableStore = (
  state: InMemoryState,
  clock: () => Date = () => new Date(),
): PayableStore => {
  if (!(state as any)._payables) (state as any)._payables = [] as Payable[];
  if (!(state as any)._templates)
    (state as any)._templates = [] as PayableTemplate[];
  if (!(state as any)._notifications)
    (state as any)._notifications = [] as NotificationConfig[];
  const payables = (state as any)._payables as Payable[];
  const templates = (state as any)._templates as PayableTemplate[];
  const notifications = (state as any)._notifications as NotificationConfig[];

  const refreshStatus = (householdId?: string): void => {
      const today = todayISO(clock);
    for (const p of payables) {
      if (householdId !== undefined && p.householdId !== householdId) continue;
      if (p.status === "pending" && p.dueDate < today) p.status = "overdue";
    }
  };

  return {
    async listPayables(householdId, filters) {
      refreshStatus(householdId);
      let list = payables.filter((p) => p.householdId === householdId);
      if (filters?.status)
        list = list.filter((p) => p.status === filters.status);
      if (filters?.type) list = list.filter((p) => p.type === filters.type);
      if (filters?.dueWithinDays) {
        const limit = clock();
        limit.setDate(limit.getDate() + filters.dueWithinDays);
        const limitStr = limit.toISOString().slice(0, 10);
        list = list.filter(
          (p) =>
            p.status === "pending" &&
            p.dueDate <= limitStr &&
            p.dueDate >= todayISO(),
        );
      }
      list.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
      return list;
    },

    async createPayable(householdId, input) {
      const p = opt<Payable>(
        {
          id: randomUUID(),
          householdId,
          accountId: input.accountId,
          description: input.description,
          amountCents: input.amountCents,
          dueDate: input.dueDate,
          type: input.type ?? "one_time",
          status: "pending" as const,
        },
        {
          frequency: input.frequency,
          endDate: input.endDate,
          reminderDaysBefore: input.reminderDaysBefore ?? 0,
          notes: input.notes,
          categoryId: input.categoryId,
        } as Partial<Payable>,
      );
      payables.push(p);
      return p;
    },

    async markPayablePaid(householdId, payableId, input) {
      const p = payables.find(
        (x) => x.id === payableId && x.householdId === householdId,
      );
      if (!p) throw domainErrors.notFound("Conta a pagar");
      if (p.status === "paid" || p.status === "cancelled") {
        throw new DomainError(
          "validation.invalid",
          `Conta a pagar já está ${p.status === "paid" ? "paga" : "cancelada"}`,
          409,
        );
      }
      // V4.1 Task 2.3 (D1/D3): mirror of the canonical store — the payment
      // always creates the expense transaction and debits the paying
      // account; insufficient balance rejects instead of clamping.
      const acc = state.accounts.find(
        (a) => a.id === p.accountId && a.householdId === householdId,
      );
      if (!acc || acc.status !== "active") throw domainErrors.notFound("Conta");
      if (acc.kind === "credit_card") {
        throw new DomainError("validation.invalid", "compra no cartão deve usar /cards/purchases.", 422);
      }
      if (acc.balanceCents < p.amountCents) {
        throw domainErrors.invalid("amountCents", "saldo insuficiente na conta de origem");
      }
      p.status = "paid";
      p.paidDate = input.paidDate ?? todayISO(clock);
      p.paidAmountCents = p.amountCents;
      if (p.type === "recurring" && p.frequency && !input.prepayMonths) {
        const nextDue = getNextDue(p.dueDate, p.frequency);
        if (nextDue && (!p.endDate || nextDue <= p.endDate)) {
          const next = opt<Payable>(
            {
              id: randomUUID(),
              householdId,
              accountId: p.accountId,
              description: p.description,
              amountCents: p.amountCents,
              dueDate: nextDue,
              type: "recurring" as const,
              frequency: p.frequency,
              status: "pending" as const,
            },
            {
              endDate: p.endDate,
              reminderDaysBefore: p.reminderDaysBefore,
              notes: p.notes,
              categoryId: p.categoryId,
            } as Partial<Payable>,
          );
          payables.push(next);
        }
      }
      // V4.1 Task 2.3 (D3): the payment always creates the expense
      // transaction — the createTransaction:false escape hatch is gone.
      const tx = opt<Transaction>(
        {
          id: randomUUID(),
          householdId,
          kind: "expense" as const,
          description: p.description,
          amountCents: p.amountCents,
          date: p.paidDate ?? todayISO(),
          accountId: p.accountId,
        },
        { categoryId: p.categoryId } as Partial<Transaction>,
      );
      state.transactions.push(tx);
      acc.balanceCents -= p.amountCents;
      p.paidTransactionId = tx.id;
      return p;
    },

    async undoPayablePayment(householdId, payableId, opts) {
      const p = payables.find(
        (x) => x.id === payableId && x.householdId === householdId,
      );
      if (!p) throw domainErrors.notFound("Conta a pagar");
      if (p.status !== "paid")
        throw new DomainError(
          "validation.invalid",
          "Apenas contas pagas podem ter pagamento desfeito",
          409,
        );
      // V4.1 Task 2.x (D4): same paidTransactionId contract as canonical.
      if (
        opts?.expectedPaidTransactionId !== undefined &&
        p.paidTransactionId !== opts.expectedPaidTransactionId
      ) {
        throw new DomainError(
          "validation.invalid",
          "paidTransactionId não confere com o pagamento vinculado",
          409,
        );
      }
      const txId = p.paidTransactionId;
      p.status = todayISO() <= p.dueDate ? "pending" : "overdue";
      (p as { paidDate?: string | undefined }).paidDate = undefined;
      (p as { paidAmountCents?: number | undefined }).paidAmountCents =
        undefined;
      (p as { paidTransactionId?: string | undefined }).paidTransactionId =
        undefined;
      if (txId) {
        // Reverse the debit booked by markPayablePaid and tombstone the
        // linked expense (soft-delete parity with the Postgres stores).
        // The recurring successor (if any) is intentionally kept (D4).
        const tx = state.transactions.find(
          (t: Transaction) => t.id === txId,
        );
        if (tx && !state.deletedTransactions.has(txId)) {
          const linked = state.accounts.find(
            (a) => a.id === tx.accountId && a.householdId === householdId,
          );
          if (linked) {
            linked.balanceCents = Math.min(
              linked.balanceCents + tx.amountCents,
              Number.MAX_SAFE_INTEGER,
            );
          }
          state.deletedTransactions.add(txId);
        }
      }
      return p;
    },

    async cancelPayable(householdId, payableId, _reason) {
      const p = payables.find(
        (x) => x.id === payableId && x.householdId === householdId,
      );
      if (!p) throw domainErrors.notFound("Conta a pagar");
      p.status = "cancelled";
      return p;
    },

    async updatePayable(householdId, payableId, input) {
      const p = payables.find(
        (x) => x.id === payableId && x.householdId === householdId,
      );
      if (!p) throw domainErrors.notFound("Conta a pagar");
      if (p.status === "cancelled")
        throw new DomainError(
          "validation.invalid",
          "Conta cancelada não pode ser editada",
          409,
        );
      if (input.description !== undefined) p.description = input.description;
      if (input.amountCents !== undefined) p.amountCents = input.amountCents;
      if (input.dueDate !== undefined) p.dueDate = input.dueDate;
      if (input.accountId !== undefined) p.accountId = input.accountId;
      if (input.categoryId !== undefined) p.categoryId = input.categoryId;
      return p;
    },

    async listTemplates(householdId, activeOnly) {
      let list = templates.filter((t) => t.householdId === householdId);
      if (activeOnly !== false) list = list.filter((t) => t.active);
      return list;
    },

    async createTemplate(householdId, input) {
      const t = opt<PayableTemplate>(
        {
          id: randomUUID(),
          householdId,
          accountId: input.accountId,
          name: input.name,
          description: input.description,
          amountCents: input.amountCents,
          frequency: input.frequency,
          dayOfMonth: input.dayOfMonth,
          active: true,
        },
        {
          reminderDaysBefore: input.reminderDaysBefore ?? 0,
          notes: input.notes,
        } as Partial<PayableTemplate>,
      );
      templates.push(t);
      return t;
    },

    async createPayableFromTemplate(householdId, input) {
      const t = input.templateId
        ? templates.find(
            (x) => x.id === input.templateId && x.householdId === householdId,
          )
        : templates.find(
            (x) =>
              x.name === input.templateName && x.householdId === householdId,
          );
      if (!t) throw domainErrors.notFound("Template");
      return this.createPayable(householdId, {
        accountId: t.accountId,
        description: t.description,
        amountCents: input.amountOverrideCents ?? t.amountCents,
        dueDate: input.dueDate,
        type: "recurring",
        frequency: t.frequency,
        ...(t.reminderDaysBefore != null
          ? { reminderDaysBefore: t.reminderDaysBefore }
          : {}),
        ...(t.notes ? { notes: t.notes } : {}),
      });
    },

    async createPayableWithTemplate(householdId, input) {
      const _t = await this.createTemplate(householdId, input.template);
      return this.createPayable(householdId, {
        ...input.payable,
        ...(input.payable.type ? { type: input.payable.type } : { type: 'recurring' }),
      });
    },

    async autoCreateFromTemplates(householdId, daysAhead = 30) {

      const today = clock();
      today.setUTCHours(0, 0, 0, 0);
      const limit = new Date(today.getTime() + daysAhead * 86_400_000);
      const limitDate = limit.toISOString().slice(0, 10);
      const created: Payable[] = [];
      for (const template of templates.filter((item) => item.householdId === householdId && item.active)) {
        const dueDate = nextTemplateDue(template.dayOfMonth, today);
        if (dueDate > limitDate) continue;
        const duplicate = payables.some((item) =>
          item.householdId === householdId && item.description === template.description && item.dueDate === dueDate,
        );
        if (duplicate) continue;
        created.push(await this.createPayableFromTemplate(householdId, {
          templateId: template.id,
          dueDate,
        }));
      }
      return created;
    },

    async refreshPayableStatus(householdId) {
      refreshStatus(householdId);
      return payables.filter((item) => item.householdId === householdId);
    },


    async listReminders(householdId) {
      refreshStatus(householdId);
      const today = todayISO(clock);
      return payables.filter(
        (p) =>
          p.householdId === householdId &&
          (p.status === "overdue" ||
            (p.status === "pending" && p.dueDate <= today)),
      );
    },

    async listNotifications(householdId) {
      return notifications.filter((n) => n.householdId === householdId);
    },
    async listAllNotifications() {
      return notifications.filter((n) => n.enabled);
    },
    async updateNotificationExecution(notificationId, householdId, state) {
      const notification = notifications.find(
        (item) => item.id === notificationId && item.householdId === householdId,
      );
      if (!notification) return;
      notification.lastRunAt = state.executedAt;
      notification.lastRunStatus = state.status;
      notification.lastSentCount = state.sent;
      notification.lastRemovedCount = state.removed;
      if (state.status === "failed") {
        notification.lastFailureAt = state.executedAt;
        if (state.error !== undefined) notification.lastError = state.error;
      } else {
        notification.lastSuccessAt = state.executedAt;
        delete notification.lastError;
      }
    },

    async configureNotification(householdId, input) {
      const existing = notifications.find(
        (n) =>
          n.householdId === householdId &&
          n.chatId === input.chatId &&
          n.notificationType === input.notificationType,
      );
      if (existing) {
        existing.enabled = input.enabled;
        if (input.scheduleHour !== undefined)
          existing.scheduleHour = input.scheduleHour;
        if (input.scheduleMinute !== undefined)
          existing.scheduleMinute = input.scheduleMinute;
        if (input.scheduleWindowMinutes !== undefined)
          existing.scheduleWindowMinutes = input.scheduleWindowMinutes;
        if (input.daysOfWeek) existing.daysOfWeek = input.daysOfWeek;
        if (input.thresholdDays !== undefined)
          existing.thresholdDays = input.thresholdDays;
        if (input.timezone !== undefined) existing.timezone = input.timezone;
        return existing;
      }
      const n: NotificationConfig = {
        id: randomUUID(),
        householdId,
        chatId: input.chatId,
        notificationType:
          input.notificationType as NotificationConfig["notificationType"],
        enabled: input.enabled,
        scheduleHour: input.scheduleHour ?? 9,
        scheduleMinute: input.scheduleMinute ?? 0,
        scheduleWindowMinutes: input.scheduleWindowMinutes ?? 60,
        daysOfWeek: input.daysOfWeek ?? [1, 2, 3, 4, 5],
        thresholdDays: input.thresholdDays ?? 1,
        timezone: input.timezone ?? "UTC",
      };
      notifications.push(n);
      return n;
    },
  };
};

function getNextDue(currentDue: string, frequency: string): string | null {
  const d = new Date(`${currentDue}T00:00:00`);
  switch (frequency) {
    case "monthly":
      d.setUTCMonth(d.getUTCMonth() + 1);
      break;
    case "quarterly":
      d.setUTCMonth(d.getUTCMonth() + 3);
      break;
    case "yearly":
      d.setUTCFullYear(d.getUTCFullYear() + 1);
      break;
    default:
      return null;
  }
  return d.toISOString().slice(0, 10);
}
