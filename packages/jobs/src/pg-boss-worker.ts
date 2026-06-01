// ─────────────────────────────────────────────────────────────────────────────
// PgBoss Worker - Production job queue worker using pg-boss
// Handles: recurrence-horizon, invoice-close, overdue-rollover, daily-summary, weekly-backup
// ─────────────────────────────────────────────────────────────────────────────

import PgBoss from 'pg-boss';
import { DATABASE_URL } from './env.js';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface PgBossWorkerOptions {
  maxConcurrency?: number;
  retentionDays?: number;
  onComplete?: (jobName: string, result: unknown) => void;
  onError?: (jobName: string, error: Error) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Job Handlers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Handler for recurrence-horizon job
 * Maintains 12-month horizon for all active recurrences
 */
async function handleRecurrenceHorizon(boss: PgBoss, job: any) {
  console.log(`[recurrence-horizon] Starting job ${job.id}`);
  
  try {
    // Import job service dynamically to avoid circular deps
    const { RecurrenceJobService } = await import('./job-service.js');
    const jobService = new RecurrenceJobService();
    
    const result = await jobService.maintainRecurrenceHorizon();
    
    console.log(`[recurrence-horizon] Processed ${result.count} recurrences`);
    if (result.errors.length > 0) {
      console.error(`[recurrence-horizon] Errors:`, result.errors);
    }
    
    return { success: true, processed: result.count, errors: result.errors };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[recurrence-horizon] Job failed: ${message}`);
    throw error;
  }
}

/**
 * Handler for invoice-close job
 * Closes all invoices past their close date
 */
async function handleInvoiceClose(boss: PgBoss, job: any) {
  console.log(`[invoice-close] Starting job ${job.id}`);
  
  try {
    const { RecurrenceJobService } = await import('./job-service.js');
    const jobService = new RecurrenceJobService();
    
    const result = await jobService.closeDueInvoices();
    
    console.log(`[invoice-close] Closed ${result.count} invoices`);
    if (result.errors.length > 0) {
      console.error(`[invoice-close] Errors:`, result.errors);
    }
    
    return { success: true, processed: result.count, errors: result.errors };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[invoice-close] Job failed: ${message}`);
    throw error;
  }
}

/**
 * Handler for overdue-rollover job
 * Rolls over overdue bills to next billing period
 */
async function handleOverdueRollover(boss: PgBoss, job: any) {
  console.log(`[overdue-rollover] Starting job ${job.id}`);
  
  try {
    // Placeholder implementation - would call RecurrenceService.rollOverOverdueBills
    console.log(`[overdue-rollover] Processed 0 overdue bills (placeholder)`);
    
    return { success: true, processed: 0, errors: [] };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[overdue-rollover] Job failed: ${message}`);
    throw error;
  }
}

/**
 * Handler for daily-summary job
 * Sends daily financial summary via WhatsApp
 */
async function handleDailySummary(boss: PgBoss, job: any) {
  console.log(`[daily-summary] Starting job ${job.id}`);
  
  try {
    // Placeholder implementation - would send WhatsApp summary
    console.log(`[daily-summary] Daily summary sent (placeholder)`);
    
    return { success: true, processed: 0, errors: [] };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[daily-summary] Job failed: ${message}`);
    throw error;
  }
}

/**
 * Handler for weekly-backup job
 * Triggers PostgreSQL backup
 */
async function handleWeeklyBackup(boss: PgBoss, job: any) {
  console.log(`[weekly-backup] Starting job ${job.id}`);
  
  try {
    // Placeholder implementation - would trigger pg_dump
    console.log(`[weekly-backup] Backup completed (placeholder)`);
    
    return { success: true, processed: 0, errors: [] };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[weekly-backup] Job failed: ${message}`);
    throw error;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PgBossWorker Class
// ─────────────────────────────────────────────────────────────────────────────

export class PgBossWorker {
  private boss: PgBoss;
  private options: Required<PgBossWorkerOptions>;
  private isRunning = false;

  constructor(options: PgBossWorkerOptions = {}) {
    this.options = {
      maxConcurrency: options.maxConcurrency ?? 5,
      retentionDays: options.retentionDays ?? 7,
      onComplete: options.onComplete ?? ((name, result) => 
        console.log(`[${name}] Completed:`, result)),
      onError: options.onError ?? ((name, error) => 
        console.error(`[${name}] Error:`, error.message)),
    };

    this.boss = new PgBoss(DATABASE_URL, {
      onError: (error) => {
        console.error('[pg-boss] Unexpected error:', error);
      },
    });
  }

  /**
   * Start the worker and register all job handlers
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.warn('[pg-boss-worker] Already running');
      return;
    }

    console.log('[pg-boss-worker] Starting worker...');
    console.log(`[pg-boss-worker] Database: ${DATABASE_URL.replace(/:[^:@]+@/, ':***@')}`);

    // Start boss (connects to DB and creates tables)
    await this.boss.start();

    // Register handlers
    await this.registerHandlers();

    this.isRunning = true;
    console.log('[pg-boss-worker] Worker started successfully');

    // Schedule recurring jobs
    await this.scheduleRecurringJobs();
  }

  /**
   * Register all job handlers
   */
  private async registerHandlers(): Promise<void> {
    // recurrence-horizon: every day at 06:00
    this.boss.work('recurrence-horizon', { teamSize: this.options.maxConcurrency, teamConcurrency: this.options.maxConcurrency }, async (job) => {
      const result = await handleRecurrenceHorizon(this.boss, job);
      this.options.onComplete('recurrence-horizon', result);
      return result;
    });

    // invoice-close: every day at 07:00
    this.boss.work('invoice-close', { teamSize: this.options.maxConcurrency, teamConcurrency: this.options.maxConcurrency }, async (job) => {
      const result = await handleInvoiceClose(this.boss, job);
      this.options.onComplete('invoice-close', result);
      return result;
    });

    // overdue-rollover: every day at 08:00
    this.boss.work('overdue-rollover', { teamSize: this.options.maxConcurrency, teamConcurrency: this.options.maxConcurrency }, async (job) => {
      const result = await handleOverdueRollover(this.boss, job);
      this.options.onComplete('overdue-rollover', result);
      return result;
    });

    // daily-summary: every day at 09:00
    this.boss.work('daily-summary', { teamSize: this.options.maxConcurrency, teamConcurrency: this.options.maxConcurrency }, async (job) => {
      const result = await handleDailySummary(this.boss, job);
      this.options.onComplete('daily-summary', result);
      return result;
    });

    // weekly-backup: every Sunday at 02:00
    this.boss.work('weekly-backup', { teamSize: this.options.maxConcurrency, teamConcurrency: this.options.maxConcurrency }, async (job) => {
      const result = await handleWeeklyBackup(this.boss, job);
      this.options.onComplete('weekly-backup', result);
      return result;
    });

    console.log('[pg-boss-worker] Registered handlers: recurrence-horizon, invoice-close, overdue-rollover, daily-summary, weekly-backup');
  }

  /**
   * Schedule recurring jobs using pg-boss scheduling
   */
  private async scheduleRecurringJobs(): Promise<void> {
    const now = new Date();

    // recurrence-horizon: daily at 06:00
    const tomorrow6am = new Date(now);
    tomorrow6am.setDate(tomorrow6am.getDate() + 1);
    tomorrow6am.setHours(6, 0, 0, 0);
    await this.boss.send('recurrence-horizon', {}, { startAfter: tomorrow6am.toISOString() });

    // invoice-close: daily at 07:00
    const tomorrow7am = new Date(now);
    tomorrow7am.setDate(tomorrow7am.getDate() + 1);
    tomorrow7am.setHours(7, 0, 0, 0);
    await this.boss.send('invoice-close', {}, { startAfter: tomorrow7am.toISOString() });

    // overdue-rollover: daily at 08:00
    const tomorrow8am = new Date(now);
    tomorrow8am.setDate(tomorrow8am.getDate() + 1);
    tomorrow8am.setHours(8, 0, 0, 0);
    await this.boss.send('overdue-rollover', {}, { startAfter: tomorrow8am.toISOString() });

    // daily-summary: daily at 09:00
    const tomorrow9am = new Date(now);
    tomorrow9am.setDate(tomorrow9am.getDate() + 1);
    tomorrow9am.setHours(9, 0, 0, 0);
    await this.boss.send('daily-summary', {}, { startAfter: tomorrow9am.toISOString() });

    // weekly-backup: every Sunday at 02:00
    const daysUntilSunday = (7 - now.getDay()) % 7 || 7;
    const nextSunday2am = new Date(now);
    nextSunday2am.setDate(nextSunday2am.getDate() + daysUntilSunday);
    nextSunday2am.setHours(2, 0, 0, 0);
    await this.boss.send('weekly-backup', {}, { startAfter: nextSunday2am.toISOString() });

    console.log('[pg-boss-worker] Scheduled recurring jobs');
  }

  /**
   * Stop the worker gracefully
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    console.log('[pg-boss-worker] Stopping worker...');
    await this.boss.stop();
    this.isRunning = false;
    console.log('[pg-boss-worker] Worker stopped');
  }

  /**
   * Get worker status
   */
  getStatus(): { running: boolean; databaseUrl: string } {
    return {
      running: this.isRunning,
      databaseUrl: DATABASE_URL.replace(/:[^:@]+@/, ':***@'),
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main entry point
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Pi Financeiro - PgBoss Worker');
  console.log('═══════════════════════════════════════════════════════════');

  const worker = new PgBossWorker({
    onComplete: (name, result) => {
      console.log(`✓ [${name}] Job completed successfully`);
    },
    onError: (name, error) => {
      console.error(`✗ [${name}] Job failed: ${error.message}`);
    },
  });

  // Handle graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`\n[pg-boss-worker] Received ${signal}, shutting down...`);
    await worker.stop();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  try {
    await worker.start();
    console.log('[pg-boss-worker] Worker is running. Press Ctrl+C to stop.');
  } catch (error) {
    console.error('[pg-boss-worker] Failed to start:', error);
    process.exit(1);
  }
}

// Run if executed directly (not imported as a module)
// Only auto-run if DATABASE_URL is set (production) or if explicitly run with node
const canAutoRun = DATABASE_URL && DATABASE_URL !== 'postgres://localhost:5432/test_db';

if (canAutoRun || process.argv[1]?.endsWith('pg-boss-worker.ts')) {
  main().catch(console.error);
}