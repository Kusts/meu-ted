// ─────────────────────────────────────────────────────────────────────────────
// WhatsApp Bridge — Public API
// ─────────────────────────────────────────────────────────────────────────────

export { createPiClient, getAgentRuntime, getWriteMode } from './pi-client-factory.js';

export type { PiClient } from './webhook-handler.js';

export {
  processWebhook,
  validateEventType,
  validateInstanceToken,
  validateGroup,
  validateSender,
  extractPhone,
  extractMessageText,
  buildSourceMessage,
  buildBridgePrompt,
} from './webhook-handler.js';
export type {
  WebhookPayload,
  WebhookStatus,
  ProcessedResult,
  UserRegistry,
  SourceMessage,
  SourceMessageStore,
  ValidationResult,
  ResponseSender,
} from './webhook-handler.js';

export { EvolutionClient, FakeEvolutionClient } from './evolution-client.js';
export type {
  EvolutionClientOptions,
  SendTextRequest,
  SendTextResponse,
} from './evolution-client.js';
