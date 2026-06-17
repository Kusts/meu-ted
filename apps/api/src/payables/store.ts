/**
 * Payable store — interface for accounts payable, templates, and notifications.
 */

import type { Payable, PayableTemplate, NotificationConfig } from '../types/domain.js';

export type PayableStore = {
  // Payables CRUD
  listPayables(householdId: string, filters?: {
    status?: string;
    type?: string;
    dueWithinDays?: number;
  }): Promise<Payable[]>;

  createPayable(householdId: string, input: {
    accountId: string;
    description: string;
    amountCents: number;
    dueDate: string;
    type?: 'one_time' | 'recurring';
    frequency?: 'monthly' | 'quarterly' | 'yearly';
    endDate?: string;
    reminderDaysBefore?: number;
    notes?: string;
    categoryId?: string;
  }): Promise<Payable>;

  markPayablePaid(householdId: string, payableId: string, input: {
    paidDate?: string;
    createTransaction?: boolean;
    prepayMonths?: number;
  }): Promise<Payable>;

  cancelPayable(householdId: string, payableId: string, reason?: string): Promise<Payable>;

  // Templates
  listTemplates(householdId: string, activeOnly?: boolean): Promise<PayableTemplate[]>;

  createTemplate(householdId: string, input: {
    accountId: string;
    name: string;
    description: string;
    amountCents: number;
    frequency: 'monthly' | 'quarterly' | 'yearly';
    dayOfMonth: number;
    reminderDaysBefore?: number;
    notes?: string;
  }): Promise<PayableTemplate>;

  createPayableFromTemplate(householdId: string, input: {
    templateId?: string;
    templateName?: string;
    dueDate: string;
    amountOverrideCents?: number;
  }): Promise<Payable>;

  // Reminders
  listReminders(householdId: string): Promise<Payable[]>;

  // Notifications
  listNotifications(householdId: string): Promise<NotificationConfig[]>;

  configureNotification(householdId: string, input: {
    chatId: string;
    notificationType: string;
    enabled: boolean;
    scheduleHour?: number;
    scheduleMinute?: number;
    daysOfWeek?: number[];
    thresholdDays?: number;
  }): Promise<NotificationConfig>;
};
