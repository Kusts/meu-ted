// ─────────────────────────────────────────────────────────────────────────────
// WhatsApp Bridge - Exports
// ─────────────────────────────────────────────────────────────────────────────

export { classifyMessage, generateClarificationPrompt } from './message-classifier.js';
export type { MessageClassification } from './message-classifier.js';

export {
  processWebhook,
  validateWebhookSecret,
  validateGroup,
  validateSender,
  extractPhone,
  extractMessageText,
  buildSourceMessage,
} from './webhook-handler.js';
export type {
  WebhookPayload,
  SourceMessage,
  ProcessedResult,
  UserRegistry,
  SourceMessageStore,
  ValidationResult,
  PiClient,
  ResponseSender,
} from './webhook-handler.js';

export { EvolutionClient, FakeEvolutionClient } from './evolution-client.js';
export type { EvolutionClientOptions, SendTextRequest, SendTextResponse } from './evolution-client.js';

export { PiRpcRunnerClient, createPiClient, getPiCommand, getPiArgs, getPiTimeoutMs } from './pi-rpc-runner-client.js';
export type { PiRpcRunnerClientOptions } from './pi-rpc-runner-client.js';

export { RpcQueue, formatPromptAsJsonl, parseJsonlResponse } from './rpc-queue.js';
export type { RpcJob, RpcResponse, QueueOptions } from './rpc-queue.js';