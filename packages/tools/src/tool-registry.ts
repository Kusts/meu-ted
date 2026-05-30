// ─────────────────────────────────────────────────────────────────────────────
// Tool Registry - Register and Execute Financial Tools
// ─────────────────────────────────────────────────────────────────────────────

import { toolFailure, type ToolContext, type ToolResult } from './tool-result.js';

export interface ToolDefinition {
  inputSchema: Record<string, unknown>;
  handler: (context: ToolContext, input: unknown) => Promise<ToolResult>;
}

export interface ToolRegistryOptions {
  idempotencyStore?: Map<string, ToolResult>;
}

export class ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map();
  private idempotencyStore: Map<string, ToolResult>;

  constructor(options: ToolRegistryOptions = {}) {
    this.idempotencyStore = options.idempotencyStore ?? new Map();
  }

  /**
   * Register a tool with its schema and handler
   */
  register(name: string, definition: ToolDefinition): void {
    this.tools.set(name, definition);
  }

  /**
   * Execute a tool by name with input validation
   * API: execute(name, input, context?)
   */
  async execute(name: string, input: unknown, context?: Partial<ToolContext>): Promise<ToolResult> {
    const ctx: ToolContext = {
      householdId: context?.householdId ?? '',
      idempotencyKey: context?.idempotencyKey,
      userId: context?.userId,
      source: context?.source,
    };

    // Check idempotency first
    if (ctx.idempotencyKey) {
      const cached = this.idempotencyStore.get(ctx.idempotencyKey);
      if (cached) {
        return cached;
      }
    }

    // Find tool
    const tool = this.tools.get(name);
    if (!tool) {
      return toolFailure(`Tool '${name}' não encontrada`);
    }

    // Validate input schema
    const validationError = this.validateInput(input, tool.inputSchema);
    if (validationError) {
      return toolFailure(`Validação falhou: ${validationError}`);
    }

    try {
      // Execute handler
      const result = await tool.handler(ctx, input);

      // Cache result if idempotency key provided
      if (ctx.idempotencyKey) {
        this.idempotencyStore.set(ctx.idempotencyKey, result);
      }

      return result;
    } catch (error) {
      // Handler exception - return failure without partial data
      return toolFailure(error instanceof Error ? error.message : 'Erro desconhecido');
    }
  }

  /**
   * List all registered tool names
   */
  listTools(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * Validate input against JSON Schema
   */
  private validateInput(input: unknown, schema: Record<string, unknown>): string | null {
    // Handle null/undefined input
    if (input === null || input === undefined) {
      return 'Input is required';
    }

    // Handle non-object input (but allow arrays for flexibility)
    if (typeof input !== 'object') {
      return 'Input must be an object or array';
    }

    const inputObj = input as Record<string, unknown>;
    const schemaObj = schema as { required?: string[]; properties?: Record<string, { type?: string }> };

    // Check required fields
    if (schemaObj.required) {
      for (const field of schemaObj.required) {
        if (inputObj[field] === undefined) {
          return `Field '${field}' is required`;
        }
      }
    }

    // Check property types
    if (schemaObj.properties) {
      for (const [key, prop] of Object.entries(schemaObj.properties)) {
        if (inputObj[key] !== undefined && prop.type) {
          const actualType = typeof inputObj[key];
          const expectedType = prop.type;
          if (actualType !== expectedType && expectedType !== 'object') {
            return `Field '${key}' must be of type ${expectedType}, got ${actualType}`;
          }
        }
      }
    }

    return null;
  }
}