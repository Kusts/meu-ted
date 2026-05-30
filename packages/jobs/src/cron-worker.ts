// ─────────────────────────────────────────────────────────────────────────────
// pg-boss Cron Worker Interface
// 
// NOTE: This is a simplified interface. The actual pg-boss integration
// requires a real database and is optional. Tests use in-memory implementations.
// ─────────────────────────────────────────────────────────────────────────────

import type { RecurrenceJobService } from './job-service.js';

// ─────────────────────────────────────────────────────────────────────────────
// Job Names
// ─────────────────────────────────────────────────────────────────────────────

export const JobNames = {
  RECURRENCE_HORIZON: 'recurrence-horizon',
  INVOICE_CLOSE: 'invoice-close',
  NOTIFICATIONS: 'notifications',
} as const;

export type JobName = typeof JobNames[keyof typeof JobNames];

// ─────────────────────────────────────────────────────────────────────────────
// Job Result Types
// ─────────────────────────────────────────────────────────────────────────────

export interface RecurrenceHorizonResult {
  count: number;
  errors: string[];
}

export interface InvoiceCloseResult {
  count: number;
  errors: string[];
}

export interface DueOccurrencesResult {
  pending: Array<{
    occurrenceId: string;
    recurrenceId: string;
    householdId: string;
    description: string;
    amountCents: number;
    dueDate: string;
  }>;
  overdue: Array<{
    occurrenceId: string;
    recurrenceId: string;
    householdId: string;
    description: string;
    amountCents: number;
    dueDate: string;
    daysOverdue: number;
  }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// CronWorker
// Interface for cron worker - can be backed by pg-boss or other implementations
// ─────────────────────────────────────────────────────────────────────────────

export interface CronWorkerOptions {
  databaseUrl: string;
  jobService: RecurrenceJobService;
  concurrency?: number;
}

export interface JobHandler {
  (data: unknown): Promise<unknown>;
}

export class CronWorker {
  private handlers: Map<string, JobHandler> = new Map();
  private started = false;

  constructor(_options: CronWorkerOptions) {
    // NOTE: In production, _options would be used to connect to pg-boss
    // For testing/interface purposes, we use a handler-based approach
  }

  /**
   * Register a job handler
   */
  async work(name: string, handler: JobHandler): Promise<void> {
    this.handlers.set(name, handler);
  }

  /**
   * Start the worker (no-op for interface - real impl would connect to pg-boss)
   */
  async start(): Promise<void> {
    this.started = true;
    console.log('[cron-worker] Started with jobs:', Object.values(JobNames));
  }

  /**
   * Stop the worker gracefully
   */
  async stop(): Promise<void> {
    this.started = false;
    console.log('[cron-worker] Stopped');
  }

  /**
   * Check if worker is started
   */
  isStarted(): boolean {
    return this.started;
  }

  /**
   * Get worker status/schedules
   */
  getSchedules(): Array<{ name: string; description: string }> {
    return [
      { name: JobNames.RECURRENCE_HORIZON, description: 'Maintains recurrence horizon' },
      { name: JobNames.INVOICE_CLOSE, description: 'Closes due invoices' },
      { name: JobNames.NOTIFICATIONS, description: 'Finds due/overdue occurrences' },
    ];
  }

  /**
   * Manually trigger a job (for testing/admin)
   */
  async triggerJob(jobName: string): Promise<unknown> {
    const handler = this.handlers.get(jobName);
    if (!handler) {
      throw new Error(`No handler registered for job: ${jobName}`);
    }
    return handler(undefined);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CronWorkerFactory - Creates worker with dependencies and registers handlers
// ─────────────────────────────────────────────────────────────────────────────

export async function createCronWorker(
  databaseUrl: string,
  deps: {
    recurrenceJobService: RecurrenceJobService;
  }
): Promise<CronWorker> {
  const worker = new CronWorker({
    databaseUrl,
    jobService: deps.recurrenceJobService,
  });

  // Register handlers
  await worker.work(JobNames.RECURRENCE_HORIZON, async () => {
    console.log(`[cron-worker] Running ${JobNames.RECURRENCE_HORIZON} job`);
    return deps.recurrenceJobService.maintainRecurrenceHorizon();
  });

  await worker.work(JobNames.INVOICE_CLOSE, async () => {
    console.log(`[cron-worker] Running ${JobNames.INVOICE_CLOSE} job`);
    return deps.recurrenceJobService.closeDueInvoices();
  });

  await worker.work(JobNames.NOTIFICATIONS, async () => {
    console.log(`[cron-worker] Running ${JobNames.NOTIFICATIONS} job`);
    return deps.recurrenceJobService.findDueOccurrences();
  });

  return worker;
}

// ─────────────────────────────────────────────────────────────────────────────
// Job Schedule Configurations
// ─────────────────────────────────────────────────────────────────────────────

export interface JobSchedule {
  name: string;
  cronExpression: string;
  description: string;
}

export const JOB_SCHEDULES: JobSchedule[] = [
  {
    name: JobNames.RECURRENCE_HORIZON,
    cronExpression: '0 0 * * *', // Daily at midnight
    description: 'Maintains recurrence horizon for all active recurrences',
  },
  {
    name: JobNames.INVOICE_CLOSE,
    cronExpression: '0 1 * * *', // Daily at 1 AM
    description: 'Closes credit card invoices past their close date',
  },
  {
    name: JobNames.NOTIFICATIONS,
    cronExpression: '0 9 * * *', // Daily at 9 AM
    description: 'Finds due/overdue occurrences for notification',
  },
];