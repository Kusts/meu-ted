// ─────────────────────────────────────────────────────────────────────────────
// Tools Package - Financial Tools Registry, Executor, and RPC utilities
// ─────────────────────────────────────────────────────────────────────────────

// Tool Result - Anti-Lie Pattern
export { createToolResult, toolSuccess, toolFailure } from './tool-result.js';
export type { ToolResult, ToolContext, ToolSuccessResult, ToolFailureResult } from './tool-result.js';

// Tool Registry
export { ToolRegistry } from './tool-registry.js';
export type { ToolDefinition, ToolRegistryOptions } from './tool-registry.js';

// Tool Executor
export { ToolExecutor } from './tool-executor.js';
export type { ToolExecutorDeps } from './tool-executor.js';

// RPC Queue/Lock
export { RpcQueue, parseJsonlResponse, formatPromptAsJsonl } from './rpc-queue.js';
export type { RpcJob, RpcResponse, QueueOptions } from './rpc-queue.js';

// TED Prompt
export { generateTedSystemPrompt, getTedToolList, validateToolResponse } from './ted-prompt.js';
export type { TedPromptOptions } from './ted-prompt.js';