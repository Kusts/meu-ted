/**
 * Payable store — interface for accounts payable, templates, and notifications.
 */

import type {
  NotificationConfig,
  Payable,
  PayableTemplate,
} from "../types/domain.js";

export type {
  NotificationConfig,
  Payable,
  PayableTemplate,
};

export type PayableStore = {
  // Payables CRUD
  listPayables(
    householdId: string,
    filters?: {
      status?: string;
      type?: string;
      dueWithinDays?: number;
    },
  ): Promise<Payable[]>;

  createPayable(
    householdId: string,
    input: {
      accountId: string;
      description: string;
      amountCents: number;
      dueDate: string;
      type?: "one_time" | "recurring";
      frequency?: "monthly" | "quarterly" | "yearly";
      endDate?: string;
      reminderDaysBefore?: number;
      notes?: string;
      categoryId?: string;
    },
  ): Promise<Payable>;

  markPayablePaid(
    householdId: string,
    payableId: string,
    input: {
      paidDate?: string;
      createTransaction?: boolean;
      prepayMonths?: number;
    },
  ): Promise<Payable>;

  cancelPayable(
    householdId: string,
    payableId: string,
    reason?: string,
  ): Promise<Payable>;

  updatePayable(
    householdId: string,
    payableId: string,
    input: {
      description?: string | undefined;
      amountCents?: number | undefined;
      dueDate?: string | undefined;
      accountId?: string | undefined;
      categoryId?: string | undefined;
    },
  ): Promise<Payable>;

  undoPayablePayment(householdId: string, payableId: string): Promise<Payable>;

  // Templates
  listTemplates(
    householdId: string,
    activeOnly?: boolean,
  ): Promise<PayableTemplate[]>;

  createTemplate(
    householdId: string,
    input: {
      accountId: string;
      name: string;
      description: string;
      amountCents: number;
      frequency: "monthly" | "quarterly" | "yearly";
      dayOfMonth: number;
      reminderDaysBefore?: number;
      notes?: string;
    },
  ): Promise<PayableTemplate>;

  createPayableFromTemplate(
    householdId: string,
    input: {
      templateId?: string;
      templateName?: string;
      dueDate: string;
      amountOverrideCents?: number;
    },
  ): Promise<Payable>;

  createPayableWithTemplate(
    householdId: string,
    input: {
      payable: {
        accountId: string;
        description: string;
        amountCents: number;
        dueDate: string;
        type?: "one_time" | "recurring";
        frequency?: "monthly" | "quarterly" | "yearly";
        endDate?: string;
        reminderDaysBefore?: number;
        notes?: string;
        categoryId?: string;
      };
      template: {
        accountId: string;
        name: string;
        description: string;
        amountCents: number;
        frequency: "monthly" | "quarterly" | "yearly";
        dayOfMonth: number;
        reminderDaysBefore?: number;
        notes?: string;
      };
    },
  ): Promise<Payable>;
  autoCreateFromTemplates(householdId: string, daysAhead?: number): Promise<Payable[]>;
  refreshPayableStatus(householdId: string): Promise<Payable[]>;


  // Template automation
  // Reminders
  listReminders(householdId: string): Promise<Payable[]>;

  // Notifications
  listNotifications(householdId: string): Promise<NotificationConfig[]>;
  listAllNotifications(): Promise<NotificationConfig[]>;
  updateNotificationExecution(
    notificationId: string,
    state: {
      status: "sent" | "deduplicated" | "failed";
      sent: number;
      removed: number;
      error?: string;
      executedAt: string;
    },
  ): Promise<void>;

  configureNotification(
    householdId: string,
    input: {
      chatId: string;
      notificationType: string;
      enabled: boolean;
      scheduleHour?: number;
      scheduleMinute?: number;
      scheduleWindowMinutes?: number;
      daysOfWeek?: number[];
      thresholdDays?: number;
      timezone?: string;
    },
  ): Promise<NotificationConfig>;
};
