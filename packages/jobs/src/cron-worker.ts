// ─────────────────────────────────────────────────────────────────────────────
// Cron Worker - Job handlers for scheduled tasks
// ─────────────────────────────────────────────────────────────────────────────

import type { RecurrenceJobService } from './job-service.js';

export interface CronJobHandler {
  name: string;
  description: string;
  cronSchedule: string;
  execute(householdId?: string): Promise<CronJobResult>;
}

export interface CronJobResult {
  success: boolean;
  job: string;
  processed: number;
  errors: string[];
  durationMs: number;
}

// Valid job names
export type JobName = 'recurrence-horizon' | 'invoice-close' | 'overdue-rollover' | 'daily-summary' | 'weekly-backup';

const JOB_SCHEDULES: Record<JobName, string> = {
  'recurrence-horizon': '0 6 * * *',   // Daily at 06:00
  'invoice-close': '0 7 * * *',        // Daily at 07:00
  'overdue-rollover': '0 8 * * *',     // Daily at 08:00
  'daily-summary': '0 9 * * *',        // Daily at 09:00
  'weekly-backup': '0 2 * * 0',        // Weekly Sunday at 02:00
};

/**
 * Create a cron job handler for recurrence horizon
 */
export function createRecurrenceHorizonHandler(
  jobService: RecurrenceJobService
): CronJobHandler {
  return {
    name: 'recurrence-horizon',
    description: 'Maintain recurrence horizon for all active recurrences',
    cronSchedule: JOB_SCHEDULES['recurrence-horizon'],
    async execute(_householdId?: string) {
      const start = Date.now();
      const errors: string[] = [];
      let processed = 0;

      try {
        const result = await jobService.maintainRecurrenceHorizon();
        processed = result.count;
        errors.push(...result.errors);
      } catch (err) {
        errors.push(err instanceof Error ? err.message : String(err));
      }

      return {
        success: errors.length === 0,
        job: 'recurrence-horizon',
        processed,
        errors,
        durationMs: Date.now() - start,
      };
    },
  };
}

/**
 * Create a cron job handler for invoice close
 */
export function createInvoiceCloseHandler(
  jobService: RecurrenceJobService
): CronJobHandler {
  return {
    name: 'invoice-close',
    description: 'Close all invoices past their close date',
    cronSchedule: JOB_SCHEDULES['invoice-close'],
    async execute(_householdId?: string) {
      const start = Date.now();
      const errors: string[] = [];
      let processed = 0;

      try {
        const result = await jobService.closeDueInvoices();
        processed = result.count;
        errors.push(...result.errors);
      } catch (err) {
        errors.push(err instanceof Error ? err.message : String(err));
      }

      return {
        success: errors.length === 0,
        job: 'invoice-close',
        processed,
        errors,
        durationMs: Date.now() - start,
      };
    },
  };
}

/**
 * Create a cron job handler for overdue rollover (placeholder)
 */
export function createOverdueRolloverHandler(): CronJobHandler {
  return {
    name: 'overdue-rollover',
    description: 'Rollover overdue bills to next month',
    cronSchedule: JOB_SCHEDULES['overdue-rollover'],
    async execute(_householdId?: string) {
      const start = Date.now();
      
      // Placeholder: would call RecurrenceService.rollOverOverdueBills
      // For now, just return success
      return {
        success: true,
        job: 'overdue-rollover',
        processed: 0,
        errors: [],
        durationMs: Date.now() - start,
      };
    },
  };
}

/**
 * Create a cron job handler for daily summary (placeholder)
 */
export function createDailySummaryHandler(): CronJobHandler {
  return {
    name: 'daily-summary',
    description: 'Send daily financial summary via WhatsApp',
    cronSchedule: JOB_SCHEDULES['daily-summary'],
    async execute(_householdId?: string) {
      const start = Date.now();
      
      // Placeholder: would call WhatsApp to send summary
      return {
        success: true,
        job: 'daily-summary',
        processed: 0,
        errors: [],
        durationMs: Date.now() - start,
      };
    },
  };
}

/**
 * Create a cron job handler for weekly backup (placeholder)
 */
export function createWeeklyBackupHandler(): CronJobHandler {
  return {
    name: 'weekly-backup',
    description: 'PostgreSQL backup dump',
    cronSchedule: JOB_SCHEDULES['weekly-backup'],
    async execute(_householdId?: string) {
      const start = Date.now();
      
      // Placeholder: would trigger pg_dump or cloud backup
      return {
        success: true,
        job: 'weekly-backup',
        processed: 0,
        errors: [],
        durationMs: Date.now() - start,
      };
    },
  };
}

/**
 * Get handler by job name
 */
export function getHandler(
  jobName: JobName,
  jobService: RecurrenceJobService
): CronJobHandler {
  switch (jobName) {
    case 'recurrence-horizon':
      return createRecurrenceHorizonHandler(jobService);
    case 'invoice-close':
      return createInvoiceCloseHandler(jobService);
    case 'overdue-rollover':
      return createOverdueRolloverHandler();
    case 'daily-summary':
      return createDailySummaryHandler();
    case 'weekly-backup':
      return createWeeklyBackupHandler();
  }
}

/**
 * Validate job name
 */
export function isValidJobName(name: string): name is JobName {
  return ['recurrence-horizon', 'invoice-close', 'overdue-rollover', 'daily-summary', 'weekly-backup'].includes(name);
}

/**
 * Get all registered handlers
 */
export function getAllHandlers(jobService: RecurrenceJobService): CronJobHandler[] {
  return [
    createRecurrenceHorizonHandler(jobService),
    createInvoiceCloseHandler(jobService),
    createOverdueRolloverHandler(),
    createDailySummaryHandler(),
    createWeeklyBackupHandler(),
  ];
}

/**
 * Stub class for backward compatibility
 */
export class CronWorker {
  async start(): Promise<void> {}
  async stop(): Promise<void> {}
}

/**
 * Create cron worker instance (alias)
 */
export function createCronWorker() {
  return new CronWorker();
}