/**
 * TedCronPlanner - Contract for cron job to call TED for task planning
 * 
 * Cron jobs (pg-boss) should call this contract to get a plan from TED,
 * then execute the validated service actions. This ensures:
 * 1. Cron sends task context to TED
 * 2. TED validates and returns typed plan
 * 3. Cron executor validates/idempotents before executing
 * 4. Failures return success=false without partial results
 * 
 * This is a port/interface that will be implemented by the Pi RPC runner
 * in Milestone 5.
 */

import type { RecurrenceService } from './recurrence-service.js';

// ─────────────────────────────────────────────────────────────────────────────
// Task Context - What cron sends to TED
// ─────────────────────────────────────────────────────────────────────────────

export const CronTaskType = {
  RECURRENCE_HORIZON: 'recurrence-horizon',
  INVOICE_CLOSE: 'invoice-close',
  OVERDUE_ROLLOVER: 'overdue-rollover',
  NOTIFICATIONS: 'notifications',
  MONTHLY_CLOSING: 'monthly-closing',
  BACKUP: 'backup',
} as const;
export type CronTaskType = typeof CronTaskType[keyof typeof CronTaskType];

export interface CronTaskContext {
  taskType: CronTaskType;
  householdId: string;
  taskId: string;        // pg-boss job ID
  attempt: number;        // Retry attempt number
  maxAttempts: number;    // Max retries before dead-letter
  createdAt: string;     // When task was created
  scheduledAt: string;   // When task was scheduled to run
  payload?: Record<string, unknown>; // Task-specific payload
}

// ─────────────────────────────────────────────────────────────────────────────
// Plan Response - What TED returns to cron
// ─────────────────────────────────────────────────────────────────────────────

export const PlanActionType = {
  CREATE_RECURRENCE_OCCURRENCES: 'create_recurrence_occurrences',
  PROCESS_OCCURRENCE: 'process_occurrence',
  CLOSE_INVOICE: 'close_invoice',
  PAY_INVOICE: 'pay_invoice',
  MARK_BILL_OVERDUE: 'mark_bill_overdue',
  SEND_NOTIFICATION: 'send_notification',
  GENERATE_REPORT: 'generate_report',
  RUN_BACKUP: 'run_backup',
} as const;
export type PlanActionType = typeof PlanActionType[keyof typeof PlanActionType];

export interface PlanAction {
  action: PlanActionType;
  entityId?: string;
  data: Record<string, unknown>;
  idempotencyKey: string; // Unique key for this action
  dependencies?: string[]; // Action IDs that must complete first
}

export interface TedCronPlan {
  taskId: string;
  householdId: string;
  actions: PlanAction[];
  warnings?: string[];     // Non-blocking warnings
  shouldRetry: boolean;   // If true, cron should retry later
  retryAfter?: string;    // ISO date to retry after
}

// ─────────────────────────────────────────────────────────────────────────────
// Execution Result - What executor reports back
// ─────────────────────────────────────────────────────────────────────────────

export interface ActionResult {
  actionId: string;
  success: boolean;
  reason?: string;         // Error reason if failed
  recordId?: string;       // Created record ID if successful
  details?: Record<string, unknown>;
}

export interface TedCronExecutionResult {
  taskId: string;
  success: boolean;
  completedActions: ActionResult[];
  failedActions: ActionResult[];
  shouldRetry: boolean;
  retryAfter?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// TedCronPlanner Interface
// ─────────────────────────────────────────────────────────────────────────────

export interface ITedCronPlanner {
  /**
   * Create execution plan from cron task context
   * Called by cron executor to get TED's validated plan
   */
  createPlan(context: CronTaskContext): Promise<TedCronPlan>;

  /**
   * Execute a single action from the plan
   * Called by cron executor to run each planned action
   * Must be idempotent - running twice should have same result
   */
  executeAction(action: PlanAction): Promise<ActionResult>;
}

// ─────────────────────────────────────────────────────────────────────────────
// TedCronPlanner Implementation (In-Memory for Milestone 4)
// ─────────────────────────────────────────────────────────────────────────────

export class InMemoryTedCronPlanner implements ITedCronPlanner {
  constructor(private deps: {
    recurrenceService: RecurrenceService;
  }) {}

  async createPlan(context: CronTaskContext): Promise<TedCronPlan> {
    const actions: PlanAction[] = [];
    const warnings: string[] = [];

    switch (context.taskType) {
      case CronTaskType.RECURRENCE_HORIZON: {
        const { recurrenceRepository } = this.deps.recurrenceService.deps;
        const recurrences = await recurrenceRepository.findActiveByHouseholdId(context.householdId);
        
        for (const recurrence of recurrences) {
          actions.push({
            action: PlanActionType.CREATE_RECURRENCE_OCCURRENCES,
            entityId: recurrence.id,
            data: { recurrenceId: recurrence.id },
            idempotencyKey: `cron:recurrence-horizon:${recurrence.id}:${context.taskId}`,
          });
        }
        break;
      }

      case CronTaskType.INVOICE_CLOSE: {
        // Requires Drizzle queries to find invoices past closesAt that are still open
        // Deferred until repository implementations use actual DB queries
        warnings.push('invoice_close requer consultas Drizzle - adiando para próxima iteração');
        break;
      }

      case CronTaskType.OVERDUE_ROLLOVER: {
        const { occurrenceRepository } = this.deps.recurrenceService.deps;
        const overdueOccurrences = await occurrenceRepository.findOverdueByHouseholdId(context.householdId);
        
        for (const occurrence of overdueOccurrences) {
          actions.push({
            action: PlanActionType.MARK_BILL_OVERDUE,
            entityId: occurrence.id,
            data: { occurrenceId: occurrence.id },
            idempotencyKey: `cron:overdue:${occurrence.id}:${context.taskId}`,
          });
        }
        break;
      }

      case CronTaskType.NOTIFICATIONS:
      case CronTaskType.MONTHLY_CLOSING:
      case CronTaskType.BACKUP: {
        warnings.push(`${context.taskType} not yet implemented`);
        break;
      }

      default:
        warnings.push(`Unknown task type: ${(context as any).taskType}`);
    }

    return {
      taskId: context.taskId,
      householdId: context.householdId,
      actions,
      warnings: warnings.length > 0 ? warnings : undefined,
      shouldRetry: false,
    };
  }

  async executeAction(action: PlanAction): Promise<ActionResult> {
    try {
      switch (action.action) {
        case PlanActionType.CREATE_RECURRENCE_OCCURRENCES: {
          const { recurrenceId } = action.data as { recurrenceId: string };
          const result = await this.deps.recurrenceService.maintainHorizon(recurrenceId);
          return {
            actionId: action.action,
            success: result.success,
            reason: result.reason,
            details: { createdCount: result.createdCount },
          };
        }

        case PlanActionType.PROCESS_OCCURRENCE: {
          const { occurrenceId } = action.data as { occurrenceId: string };
          const result = await this.deps.recurrenceService.processOccurrence(occurrenceId);
          return {
            actionId: action.action,
            success: result.success,
            reason: result.reason,
            recordId: result.record?.id,
          };
        }

        case PlanActionType.MARK_BILL_OVERDUE: {
          const { occurrenceId } = action.data as { occurrenceId: string };
          const { occurrenceRepository } = this.deps.recurrenceService.deps;
          await occurrenceRepository.update(occurrenceId, { status: 'overdue' });
          return {
            actionId: action.action,
            success: true,
          };
        }

        default:
          return {
            actionId: action.action,
            success: false,
            reason: `Unknown action type: ${action.action}`,
          };
      }
    } catch (error) {
      return {
        actionId: action.action,
        success: false,
        reason: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}