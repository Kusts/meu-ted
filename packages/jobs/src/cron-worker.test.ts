// ─────────────────────────────────────────────────────────────────────────────
// Cron Worker Tests
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createRecurrenceHorizonHandler,
  createInvoiceCloseHandler,
  createOverdueRolloverHandler,
  createDailySummaryHandler,
  createWeeklyBackupHandler,
  getHandler,
  isValidJobName,
  getAllHandlers,
} from './cron-worker.js';
import { RecurrenceJobService } from './job-service.js';
import {
  RecurrenceService,
  CardInvoiceService,
  InMemoryRecurrenceRepository,
  InMemoryInvoiceRepository,
  InMemoryRecurrenceOccurrenceRepository,
  InMemoryCreditCardRepository,
  InMemoryAccountRepository,
  InMemoryFinancialRecordRepository,
  InMemoryLedgerRepository,
  InMemoryAuditLogRepository,
  InMemoryInstallmentGroupRepository,
  InMemoryBillRepository,
} from '@pi-financeiro/domain';

describe('CronWorker', () => {
  let jobService: RecurrenceJobService;
  let recurrenceRepo: InMemoryRecurrenceRepository;
  let invoiceRepo: InMemoryInvoiceRepository;
  let occurrenceRepo: InMemoryRecurrenceOccurrenceRepository;

  beforeEach(async () => {
    recurrenceRepo = new InMemoryRecurrenceRepository();
    invoiceRepo = new InMemoryInvoiceRepository();
    occurrenceRepo = new InMemoryRecurrenceOccurrenceRepository();

    const accountRepo = new InMemoryAccountRepository();
    const recordRepo = new InMemoryFinancialRecordRepository();
    const ledgerRepo = new InMemoryLedgerRepository();
    const auditRepo = new InMemoryAuditLogRepository();
    const cardRepo = new InMemoryCreditCardRepository();
    const installmentRepo = new InMemoryInstallmentGroupRepository();
    const billRepo = new InMemoryBillRepository();

    const recurrenceService = new RecurrenceService({
      recurrenceRepository: recurrenceRepo,
      occurrenceRepository: occurrenceRepo,
      accountRepository: accountRepo,
      recordRepository: recordRepo,
      ledgerRepository: ledgerRepo,
      auditRepository: auditRepo,
      billRepository: billRepo,
      cardRepository: cardRepo,
      invoiceRepository: invoiceRepo,
      installmentGroupRepository: installmentRepo,
    });

    const cardInvoiceService = new CardInvoiceService({
      cardRepository: cardRepo,
      invoiceRepository: invoiceRepo,
      recordRepository: recordRepo,
      ledgerRepository: ledgerRepo,
      auditRepository: auditRepo,
      installmentGroupRepository: installmentRepo,
      accountRepository: accountRepo,
    });

    jobService = new RecurrenceJobService({
      recurrenceRepository: recurrenceRepo,
      invoiceRepository: invoiceRepo,
      occurrenceRepository: occurrenceRepo,
      recurrenceService,
      cardInvoiceService,
    });
  });

  describe('recurrence-horizon handler', () => {
    it('executes without error', async () => {
      const handler = createRecurrenceHorizonHandler(jobService);

      const result = await handler.execute();

      expect(result.success).toBe(true);
      expect(result.job).toBe('recurrence-horizon');
      expect(result.errors).toHaveLength(0);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('executes successfully even with no recurrences', async () => {
      const handler = createRecurrenceHorizonHandler(jobService);

      const result = await handler.execute('house-1');

      expect(result.job).toBe('recurrence-horizon');
      expect(result.processed).toBe(0);
      expect(result.success).toBe(true);
    });
  });

  describe('invoice-close handler', () => {
    it('executes without error', async () => {
      const handler = createInvoiceCloseHandler(jobService);

      const result = await handler.execute();

      expect(result.success).toBe(true);
      expect(result.job).toBe('invoice-close');
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('overdue-rollover handler', () => {
    it('executes without error', async () => {
      const handler = createOverdueRolloverHandler();

      const result = await handler.execute();

      expect(result.success).toBe(true);
      expect(result.job).toBe('overdue-rollover');
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('daily-summary handler', () => {
    it('executes without error (placeholder)', async () => {
      const handler = createDailySummaryHandler();

      const result = await handler.execute();

      expect(result.success).toBe(true);
      expect(result.job).toBe('daily-summary');
      expect(result.processed).toBe(0);
    });
  });

  describe('weekly-backup handler', () => {
    it('executes without error (placeholder)', async () => {
      const handler = createWeeklyBackupHandler();

      const result = await handler.execute();

      expect(result.success).toBe(true);
      expect(result.job).toBe('weekly-backup');
      expect(result.processed).toBe(0);
    });
  });

  describe('getHandler', () => {
    it('returns correct handler for each job name', () => {
      expect(getHandler('recurrence-horizon', jobService).name).toBe('recurrence-horizon');
      expect(getHandler('invoice-close', jobService).name).toBe('invoice-close');
      expect(getHandler('overdue-rollover', jobService).name).toBe('overdue-rollover');
      expect(getHandler('daily-summary', jobService).name).toBe('daily-summary');
      expect(getHandler('weekly-backup', jobService).name).toBe('weekly-backup');
    });
  });

  describe('isValidJobName', () => {
    it('returns true for valid job names', () => {
      expect(isValidJobName('recurrence-horizon')).toBe(true);
      expect(isValidJobName('invoice-close')).toBe(true);
      expect(isValidJobName('overdue-rollover')).toBe(true);
      expect(isValidJobName('daily-summary')).toBe(true);
      expect(isValidJobName('weekly-backup')).toBe(true);
    });

    it('returns false for invalid job names', () => {
      expect(isValidJobName('invalid-job')).toBe(false);
      expect(isValidJobName('')).toBe(false);
      expect(isValidJobName('RECURRENCE-HORIZON')).toBe(false);
    });
  });

  describe('getAllHandlers', () => {
    it('returns all 5 handlers', () => {
      const handlers = getAllHandlers(jobService);

      expect(handlers).toHaveLength(5);
      expect(handlers.map(h => h.name)).toContain('recurrence-horizon');
      expect(handlers.map(h => h.name)).toContain('invoice-close');
      expect(handlers.map(h => h.name)).toContain('overdue-rollover');
      expect(handlers.map(h => h.name)).toContain('daily-summary');
      expect(handlers.map(h => h.name)).toContain('weekly-backup');
    });

    it('handlers have correct cron schedules', () => {
      const handlers = getAllHandlers(jobService);

      const horizon = handlers.find(h => h.name === 'recurrence-horizon');
      expect(horizon?.cronSchedule).toBe('0 6 * * *');

      const invoice = handlers.find(h => h.name === 'invoice-close');
      expect(invoice?.cronSchedule).toBe('0 7 * * *');

      const overdue = handlers.find(h => h.name === 'overdue-rollover');
      expect(overdue?.cronSchedule).toBe('0 8 * * *');
    });
  });
});