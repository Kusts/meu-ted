// ─────────────────────────────────────────────────────────────────────────────
// Job Service - Encapsulates cron job business logic
// Used by pg-boss worker, testable with in-memory repos
// ─────────────────────────────────────────────────────────────────────────────

import type { IRecurrenceRepository } from '@pi-financeiro/domain';
import type { IInvoiceRepository } from '@pi-financeiro/domain';
import type { IRecurrenceOccurrenceRepository } from '@pi-financeiro/domain';
import type { RecurrenceService } from '@pi-financeiro/domain';
import type { CardInvoiceService } from '@pi-financeiro/domain';

// ─────────────────────────────────────────────────────────────────────────────
// Job Summary - Return type for all jobs
// ─────────────────────────────────────────────────────────────────────────────

export interface JobSummary {
  recurrencesMaintained: number;
  invoicesClosed: number;
  notificationsSent: number;
  errors: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// RecurrenceJobService
// Encapsulates finding recurrences/faturas and calling core services
// ─────────────────────────────────────────────────────────────────────────────

export class RecurrenceJobService {
  constructor(private deps: {
    recurrenceRepository: IRecurrenceRepository;
    invoiceRepository: IInvoiceRepository;
    occurrenceRepository: IRecurrenceOccurrenceRepository;
    recurrenceService: RecurrenceService;
    cardInvoiceService: CardInvoiceService;
  }) {}

  /**
   * Run recurrence horizon maintenance for all active recurrences
   */
  async maintainRecurrenceHorizon(): Promise<{ count: number; errors: string[] }> {
    const errors: string[] = [];
    let count = 0;

    try {
      // Find all active recurrences
      const households = await this.deps.recurrenceRepository.findHouseholdsWithActiveRecurrences();
      
      for (const householdId of households) {
        try {
          const recurrences = await this.deps.recurrenceRepository.findActiveByHouseholdId(householdId);
          
          for (const recurrence of recurrences) {
            try {
              const result = await this.deps.recurrenceService.maintainHorizon(recurrence.id);
              if (result.success) {
                count++;
              } else if (result.reason) {
                errors.push(`recurrence ${recurrence.id}: ${result.reason}`);
              }
            } catch (err) {
              errors.push(`recurrence ${recurrence.id}: ${err instanceof Error ? err.message : String(err)}`);
            }
          }
        } catch (err) {
          errors.push(`household ${householdId}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    } catch (err) {
      errors.push(`maintainRecurrenceHorizon: ${err instanceof Error ? err.message : String(err)}`);
    }

    return { count, errors };
  }

  /**
   * Close all invoices that have passed their close date
   */
  async closeDueInvoices(): Promise<{ count: number; errors: string[] }> {
    const errors: string[] = [];
    let count = 0;

    try {
      const openInvoices = await this.deps.invoiceRepository.findOpenInvoices();

      for (const invoice of openInvoices) {
        try {
          const now = new Date();
          const closesAt = new Date(invoice.closesAt);

          if (closesAt <= now) {
            const result = await this.deps.cardInvoiceService.closeInvoice({
              householdId: invoice.householdId,
              invoiceId: invoice.id,
            });
            if (result.success) {
              count++;
            } else if (result.reason) {
              errors.push(`invoice ${invoice.id}: ${result.reason}`);
            }
          }
        } catch (err) {
          errors.push(`invoice ${invoice.id}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    } catch (err) {
      errors.push(`closeDueInvoices: ${err instanceof Error ? err.message : String(err)}`);
    }

    return { count, errors };
  }

  /**
   * Find upcoming/overdue occurrences for notification
   * Returns occurrence data for notification job to process
   */
  async findDueOccurrences(): Promise<{
    pending: Array<{ occurrenceId: string; recurrenceId: string; householdId: string; description: string; amountCents: number; dueDate: string }>;
    overdue: Array<{ occurrenceId: string; recurrenceId: string; householdId: string; description: string; amountCents: number; dueDate: string; daysOverdue: number }>;
    errors: string[];
  }> {
    const errors: string[] = [];
    const pending: Array<{ occurrenceId: string; recurrenceId: string; householdId: string; description: string; amountCents: number; dueDate: string }> = [];
    const overdue: Array<{ occurrenceId: string; recurrenceId: string; householdId: string; description: string; amountCents: number; dueDate: string; daysOverdue: number }> = [];

    try {
      const households = await this.deps.recurrenceRepository.findHouseholdsWithActiveRecurrences();
      
      for (const householdId of households) {
        try {
          const recurrences = await this.deps.recurrenceRepository.findActiveByHouseholdId(householdId);
          
          for (const recurrence of recurrences) {
            const occurrences = await this.deps.occurrenceRepository.findPendingByRecurrenceId(recurrence.id);
            
            for (const occurrence of occurrences) {
              const occurrenceDate = new Date(occurrence.occurrenceDate);
            const now = new Date();
            const daysDiff = Math.ceil((occurrenceDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

              if (daysDiff < 0) {
                overdue.push({
                  occurrenceId: occurrence.id,
                  recurrenceId: recurrence.id,
                  householdId,
                  description: recurrence.description,
                  amountCents: recurrence.amountCents,
                  dueDate: occurrence.occurrenceDate,
                  daysOverdue: Math.abs(daysDiff),
                });
              } else if (daysDiff <= 3) {
                pending.push({
                  occurrenceId: occurrence.id,
                  recurrenceId: recurrence.id,
                  householdId,
                  description: recurrence.description,
                  amountCents: recurrence.amountCents,
                  dueDate: occurrence.occurrenceDate,
                });
              }
            }
          }
        } catch (err) {
          errors.push(`household ${householdId}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    } catch (err) {
      errors.push(`findDueOccurrences: ${err instanceof Error ? err.message : String(err)}`);
    }

    return { pending, overdue, errors };
  }

  /**
   * Run all daily jobs
   */
  async runDailyJobs(): Promise<JobSummary> {
    const [horizon, invoices] = await Promise.all([
      this.maintainRecurrenceHorizon(),
      this.closeDueInvoices(),
    ]);

    const dueOccurrences = await this.findDueOccurrences();

    return {
      recurrencesMaintained: horizon.count,
      invoicesClosed: invoices.count,
      notificationsSent: dueOccurrences.pending.length + dueOccurrences.overdue.length,
      errors: [...horizon.errors, ...invoices.errors, ...dueOccurrences.errors],
    };
  }
}