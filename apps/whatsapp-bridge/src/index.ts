// ─────────────────────────────────────────────────────────────────────────────
// WhatsApp Bridge - Exports
// ─────────────────────────────────────────────────────────────────────────────

// Re-export factory functions
export { createPiClient, getAgentRuntime, getWriteMode } from './pi-client-factory.js';

// Re-export bridge
export { PiBridge, createPiBridge } from './pi-bridge.js';
export type { PiBridgeOptions } from './pi-bridge.js';

// PiClient type from webhook-handler
export type { PiClient } from './webhook-handler.js';

// Message classifier
export { classifyMessage, generateClarificationPrompt } from './message-classifier.js';
export type { MessageClassification } from './message-classifier.js';

// Webhook handler
export {
  processWebhook,
  validateEventType,
  validateInstanceToken,
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
  ResponseSender,
} from './webhook-handler.js';

// Evolution client
export { EvolutionClient, FakeEvolutionClient } from './evolution-client.js';
export type { EvolutionClientOptions, SendTextRequest, SendTextResponse } from './evolution-client.js';