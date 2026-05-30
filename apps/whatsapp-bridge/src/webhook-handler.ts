// ─────────────────────────────────────────────────────────────────────────────
// Webhook Handler - Validates and processes Evolution API webhooks
// ─────────────────────────────────────────────────────────────────────────────

import { classifyMessage, generateClarificationPrompt, type MessageClassification } from './message-classifier.js';

export interface WebhookPayload {
  secret: string;
  instanceId: string;
  timestamp: number;
  data: {
    key: {
      remoteJid: string;
      fromMe: boolean;
      id: string;
    };
    message?: {
      conversation?: string;
      extendedTextMessage?: { text: string };
    };
    pushName?: string;
  };
}

export interface SourceMessage {
  id: string;
  providerMessageId: string;
  remoteJid: string;
  fromMe: boolean;
  text: string;
  senderPhone: string;
  pushName?: string;
  timestamp: number;
  processed: boolean;
  processedAt?: string;
  classification?: MessageClassification;
  tedResponse?: string;
  errorReason?: string;
}

export interface ProcessedResult {
  success: boolean;
  classification: MessageClassification;
  response?: string;
  sourceMessageId?: string;
  reason?: string;
}

export interface UserRegistry {
  isPhoneRegistered(phone: string): boolean;
  isGroupAllowed(groupId: string): boolean;
  getHouseholdIdForGroup(groupId: string): string | null;
}

export interface SourceMessageStore {
  isProcessed(providerMessageId: string): boolean;
  markProcessed(msg: SourceMessage): void;
  saveError(providerMessageId: string, error: string): void;
}

/**
 * Webhook validation result
 */
export interface ValidationResult {
  valid: boolean;
  reason?: string;
}

/**
 * Validate webhook secret
 */
export function validateWebhookSecret(
  payload: WebhookPayload,
  expectedSecret: string
): ValidationResult {
  if (payload.secret !== expectedSecret) {
    return { valid: false, reason: 'secret inválido' };
  }
  return { valid: true };
}

/**
 * Validate group is allowed
 */
export function validateGroup(
  payload: WebhookPayload,
  registry: UserRegistry
): ValidationResult {
  const groupId = payload.data.key.remoteJid;
  
  if (!registry.isGroupAllowed(groupId)) {
    return { valid: false, reason: 'grupo não permitido' };
  }
  return { valid: true };
}

/**
 * Validate sender phone is registered
 */
export function validateSender(
  payload: WebhookPayload,
  registry: UserRegistry
): ValidationResult {
  const phone = extractPhone(payload.data.key.remoteJid);
  
  if (!phone || !registry.isPhoneRegistered(phone)) {
    return { valid: false, reason: 'telefone não cadastrado' };
  }
  return { valid: true };
}

/**
 * Extract phone number from WhatsApp JID
 */
export function extractPhone(remoteJid: string): string {
  // Remove @s.whatsapp.net for personal JIDs
  // Remove @g.us for group JIDs (keeping the number before @)
  return remoteJid
    .replace(/@s\.whatsapp\.net$/, '')
    .replace(/@g\.us$/, '');
}

/**
 * Extract text from webhook payload
 */
export function extractMessageText(payload: WebhookPayload): string {
  const msg = payload.data.message;
  if (msg?.conversation) {
    return msg.conversation;
  }
  if (msg?.extendedTextMessage?.text) {
    return msg.extendedTextMessage.text;
  }
  return '';
}

/**
 * Build SourceMessage from payload
 */
export function buildSourceMessage(payload: WebhookPayload): SourceMessage {
  return {
    id: crypto.randomUUID(),
    providerMessageId: payload.data.key.id,
    remoteJid: payload.data.key.remoteJid,
    fromMe: payload.data.key.fromMe,
    text: extractMessageText(payload),
    senderPhone: extractPhone(payload.data.key.remoteJid),
    pushName: payload.data.pushName,
    timestamp: payload.timestamp,
    processed: false,
  };
}

/**
 * Process webhook - main entry point
 */
export async function processWebhook(
  payload: WebhookPayload,
  expectedSecret: string,
  userRegistry: UserRegistry,
  sourceStore: SourceMessageStore,
  piClient: PiClient,
  responseSender: ResponseSender
): Promise<ProcessedResult> {
  // Step 1: Validate secret
  const secretValidation = validateWebhookSecret(payload, expectedSecret);
  if (!secretValidation.valid) {
    return {
      success: false,
      classification: { type: 'ignored' },
      reason: secretValidation.reason,
    };
  }

  // Step 2: Ignore own messages
  if (payload.data.key.fromMe) {
    return {
      success: true,
      classification: { type: 'ignored' },
      reason: 'mensagem própria ignorada',
    };
  }

  // Step 3: Validate group
  const groupValidation = validateGroup(payload, userRegistry);
  if (!groupValidation.valid) {
    return {
      success: false,
      classification: { type: 'ignored' },
      reason: groupValidation.reason,
    };
  }

  // Step 4: Validate sender
  const senderValidation = validateSender(payload, userRegistry);
  if (!senderValidation.valid) {
    return {
      success: false,
      classification: { type: 'ignored' },
      reason: senderValidation.reason,
    };
  }

  // Step 5: Build source message
  const sourceMsg = buildSourceMessage(payload);

  // Step 6: Check idempotency
  if (sourceStore.isProcessed(sourceMsg.providerMessageId)) {
    return {
      success: true,
      classification: { type: 'ignored' },
      sourceMessageId: sourceMsg.id,
      reason: 'mensagem duplicada',
    };
  }

  // Step 7: Classify message
  const classification = classifyMessage(sourceMsg.text);
  sourceMsg.classification = classification;

  // Step 8: Handle classification
  switch (classification.type) {
    case 'ignored':
      // Mark as processed but don't respond
      sourceStore.markProcessed(sourceMsg);
      return { success: true, classification, sourceMessageId: sourceMsg.id };

    case 'clarification_needed':
      const response = generateClarificationPrompt(classification.missingInfo);
      sourceMsg.tedResponse = response;
      await responseSender.send(sourceMsg.remoteJid, response);
      sourceStore.markProcessed(sourceMsg);
      return { success: true, classification, response, sourceMessageId: sourceMsg.id };

    case 'command':
    case 'financial_detected':
      // Forward to Pi/TED
      try {
        const tedResult = await piClient.send(
          sourceMsg.text,
          sourceMsg.senderPhone,
          {
            householdId: userRegistry.getHouseholdIdForGroup(sourceMsg.remoteJid) ?? 'unknown',
            source: 'whatsapp',
            idempotencyKey: `whatsapp:${sourceMsg.providerMessageId}`,
          }
        );

        if (tedResult.success && tedResult.data?.message) {
          sourceMsg.tedResponse = tedResult.data.message;
          await responseSender.send(sourceMsg.remoteJid, tedResult.data.message);
        } else if (!tedResult.success) {
          sourceMsg.errorReason = tedResult.reason;
          sourceStore.saveError(sourceMsg.providerMessageId, tedResult.reason || 'unknown');
          await responseSender.send(sourceMsg.remoteJid, `❌ ${tedResult.reason || 'erro'}`);
        }

        sourceStore.markProcessed(sourceMsg);
        return {
          success: true,
          classification,
          response: sourceMsg.tedResponse,
          sourceMessageId: sourceMsg.id,
        };
      } catch (error) {
        sourceMsg.errorReason = error instanceof Error ? error.message : 'erro desconhecido';
        sourceStore.saveError(sourceMsg.providerMessageId, sourceMsg.errorReason);
        return {
          success: false,
          classification,
          reason: sourceMsg.errorReason,
          sourceMessageId: sourceMsg.id,
        };
      }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Pi Client Interface
// ─────────────────────────────────────────────────────────────────────────────

export interface PiClient {
  send(
    message: string,
    senderPhone: string,
    context: { householdId: string; source: string; idempotencyKey?: string }
  ): Promise<{ success: boolean; reason?: string; data?: { message?: string } }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Response Sender Interface
// ─────────────────────────────────────────────────────────────────────────────

export interface ResponseSender {
  send(groupId: string, message: string): Promise<void>;
}