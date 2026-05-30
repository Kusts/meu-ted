// ─────────────────────────────────────────────────────────────────────────────
// Tool Result - Anti-Lie Pattern (REQ-005)
// Returns success=true ONLY after service confirms, failure returns reason only
// ─────────────────────────────────────────────────────────────────────────────

export interface ToolContext {
  householdId: string;
  idempotencyKey?: string;
  userId?: string;
  source?: 'whatsapp' | 'dashboard' | 'cron' | 'agent';
}

export interface ToolSuccessResult<T = unknown> {
  success: true;
  data: T;
}

export interface ToolFailureResult {
  success: false;
  reason: string;
  data?: never; // Never include data on failure - anti-lie
}

export type ToolResult<T = unknown> = ToolSuccessResult<T> | ToolFailureResult;

export function createToolResult<T>(result: ToolSuccessResult<T>): ToolSuccessResult<T>;
export function createToolResult(result: ToolFailureResult): ToolFailureResult;
export function createToolResult<T>(result: ToolSuccessResult<T> | ToolFailureResult): ToolResult<T> {
  return result;
}

// Helper to create success result
export function toolSuccess<T>(data: T): ToolSuccessResult<T> {
  return { success: true, data };
}

// Helper to create failure result
export function toolFailure(reason: string): ToolFailureResult {
  return { success: false, reason };
}