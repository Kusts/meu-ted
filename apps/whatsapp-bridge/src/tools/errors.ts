/**
 * Tool Errors — domain-specific error types for tool operations
 * These are structural errors only — no financial logic here.
 */

export class ToolError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ToolError';
  }
}

export class ValidationError extends ToolError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'VALIDATION_ERROR', context);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends ToolError {
  constructor(entity: string, id: string, context?: Record<string, unknown>) {
    super(`${entity} not found: ${id}`, 'NOT_FOUND', { entity, id, ...context });
    this.name = 'NotFoundError';
  }
}

export class AlreadyExistsError extends ToolError {
  constructor(entity: string, field: string, value: string, context?: Record<string, unknown>) {
    super(`${entity} with ${field}=${value} already exists`, 'ALREADY_EXISTS', { entity, field, value, ...context });
    this.name = 'AlreadyExistsError';
  }
}

export class ConflictError extends ToolError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'CONFLICT', context);
    this.name = 'ConflictError';
  }
}

export class ExpiredError extends ToolError {
  constructor(operationId: string, context?: Record<string, unknown>) {
    super(`Operation expired: ${operationId}`, 'EXPIRED', { operationId, ...context });
    this.name = 'ExpiredError';
  }
}

/**
 * Validates that a string is a valid UUID v4
 */
export function validateUUID(id: string, fieldName: string): void {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!id || !uuidRegex.test(id)) {
    throw new ValidationError(`${fieldName} must be a valid UUID`, { fieldName, value: id });
  }
}

/**
 * Validates that amount_cents is a positive integer
 */
export function validatePositiveCents(amount: number, fieldName: string): void {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new ValidationError(`${fieldName} must be a positive integer (cents)`, { fieldName, value: amount });
  }
}

/**
 * Validates that amount_cents is a non-negative integer (for initial_balance that can be negative)
 */
export function validateCents(amount: number, fieldName: string): void {
  if (!Number.isInteger(amount)) {
    throw new ValidationError(`${fieldName} must be an integer (cents)`, { fieldName, value: amount });
  }
}

/**
 * Validates ISO date format YYYY-MM-DD
 */
export function validateDateString(dateStr: string, fieldName: string): void {
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateStr || !dateRegex.test(dateStr)) {
    throw new ValidationError(`${fieldName} must be ISO date YYYY-MM-DD`, { fieldName, value: dateStr });
  }
}

/**
 * Validates non-empty string
 */
export function validateNonEmpty(value: string, fieldName: string): void {
  if (!value || value.trim().length === 0) {
    throw new ValidationError(`${fieldName} must be a non-empty string`, { fieldName, value });
  }
}

/**
 * Validates kind enum
 */
export function validateKind(value: string, allowedKinds: string[], fieldName: string): void {
  if (!allowedKinds.includes(value)) {
    throw new ValidationError(`${fieldName} must be one of: ${allowedKinds.join(', ')}`, { fieldName, value });
  }
}