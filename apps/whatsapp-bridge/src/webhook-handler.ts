// ─────────────────────────────────────────────────────────────────────────────
// Webhook Handler - Validates and processes Evolution GO API webhooks
// ─────────────────────────────────────────────────────────────────────────────
import { classifyMessage, generateClarificationPrompt, type MessageClassification } from './message-classifier.js';

const PI_RPC_DISABLED_REASON = 'Pi RPC desabilitado em modo desenvolvimento';
const GENERAL_FALLBACK_MESSAGE = 'Oi! Sou o TED, seu assistente pessoal de finanças. Pode me mandar gastos, dúvidas, metas ou qualquer pergunta.';

// User prefers only typing indicator, no progress texts
// Set PROGRESS_THRESHOLD_3S_MS high to effectively disable them
const PROGRESS_THRESHOLD_3S_MS = 999999;
const PROGRESS_THRESHOLD_8S_MS = 999999;
const PROGRESS_TEXT_3S = '';
const PROGRESS_TEXT_8S = '';

// ─────────────────────────────────────────────────────────────────────────────
// Evolution GO Webhook Payload
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Evolution GO webhook payload (POST from GO to our server)
 *
 * Example (Message event):
 * {
 *   "event": "Message",
 *   "instanceId": "uuid",
 *   "instanceToken": "token",
 *   "data": {
 *     "Info": {
 *       "Chat": "5511...@s.whatsapp.net",
 *       "Sender": "5511...:19@s.whatsapp.net",
 *       "IsFromMe": false,
 *       "IsGroup": false,
 *       "ID": "3EB0...",
 *       "Type": "text",
 *       "PushName": "João",
 *       "Timestamp": "2024-10-10T17:17:44-03:00"
 *     },
 *     "Message": {
 *       "conversation": "oi"
 *     }
 *   }
 * }
 */
export interface WebhookPayload {
  event: string;
  instanceId: string;
  instanceToken: string;
  data: {
    Info: {
      Chat: string;
      Sender: string;
      IsFromMe: boolean;
      IsGroup: boolean;
      ID: string;
      Type: string;
      PushName: string;
      Timestamp: string;
    };
    Message: {
      conversation?: string;
      extendedTextMessage?: { text: string };
      imageMessage?: { caption: string };
      videoMessage?: { caption: string };
      documentMessage?: { title: string };
      [key: string]: unknown;
    };
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal types
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// Validation functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validate webhook is a Message event (ignore Connection, Receipt, etc.)
 */
export function validateEventType(payload: WebhookPayload): ValidationResult {
  if (payload.event !== 'Message') {
    return { valid: false, reason: `evento ignorado: ${payload.event}` };
  }
  return { valid: true };
}

/**
 * Validate instance token matches expected token
 * In Evolution GO, the instanceToken is sent in the webhook payload.
 * We validate it against our configured token to prevent spoofed webhooks.
 */
export function validateInstanceToken(
  payload: WebhookPayload,
  expectedToken: string
): ValidationResult {
  if (!expectedToken) {
    // No token configured — skip validation (dev mode)
    return { valid: true };
  }
  if (payload.instanceToken !== expectedToken) {
    return { valid: false, reason: 'instanceToken inválido' };
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
  const groupId = payload.data.Info.Chat;
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
  const phone = extractPhone(payload.data.Info.Sender);
  if (!phone || !registry.isPhoneRegistered(phone)) {
    return { valid: false, reason: 'telefone não cadastrado' };
  }
  return { valid: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Extraction helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extract phone number from WhatsApp JID
 * Handles both personal JIDs (5511...@s.whatsapp.net, 5511...:19@s.whatsapp.net)
 * and group JIDs (@g.us)
 */
export function extractPhone(remoteJid: string): string {
  return remoteJid
    .replace(/@s\.whatsapp\.net$/, '')
    .replace(/@g\.us$/, '')
    .replace(/:\d+$/, ''); // Remove device suffix like :19
}

/**
 * Extract text from webhook payload
 */
export function extractMessageText(payload: WebhookPayload): string {
  const msg = payload.data.Message;
  if (msg?.conversation) {
    return msg.conversation;
  }
  if (msg?.extendedTextMessage?.text) {
    return msg.extendedTextMessage.text;
  }
  if (msg?.imageMessage?.caption) {
    return msg.imageMessage.caption;
  }
  if (msg?.videoMessage?.caption) {
    return msg.videoMessage.caption;
  }
  return '';
}

/**
 * Build SourceMessage from payload
 */
export function buildSourceMessage(payload: WebhookPayload): SourceMessage {
  const timestamp = new Date(payload.data.Info.Timestamp).getTime() / 1000;

  return {
    id: crypto.randomUUID(),
    providerMessageId: payload.data.Info.ID,
    remoteJid: payload.data.Info.Chat,
    fromMe: payload.data.Info.IsFromMe,
    text: extractMessageText(payload),
    senderPhone: extractPhone(payload.data.Info.Sender),
    pushName: payload.data.Info.PushName || undefined,
    timestamp: Number.isNaN(timestamp) ? Date.now() / 1000 : timestamp,
    processed: false,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Hybrid progress logger (presence + timed text messages)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Wraps an async operation with composing/paused presence and optional progress text.
 * - Sends "composing" immediately.
 * - At 3s: sends first progress text (🔎).
 * - At 8s: sends second progress text (🧮).
 * - On completion/error: clears timers and sends "paused".
 * Only applies to messages that will be processed (not ignored).
 */
async function withHybridProgress<T>(
  chatId: string,
  responseSender: ResponseSender,
  fn: () => Promise<T>
): Promise<T> {
  await responseSender.sendPresence?.(chatId, 'composing');

  let timer3s: ReturnType<typeof setTimeout> | undefined;
  let timer8s: ReturnType<typeof setTimeout> | undefined;

  timer3s = setTimeout(() => {
    void responseSender.send(chatId, PROGRESS_TEXT_3S).catch(() => {});
  }, PROGRESS_THRESHOLD_3S_MS);

  timer8s = setTimeout(() => {
    void responseSender.send(chatId, PROGRESS_TEXT_8S).catch(() => {});
  }, PROGRESS_THRESHOLD_8S_MS);

  try {
    return await fn();
  } finally {
    if (timer3s) clearTimeout(timer3s);
    if (timer8s) clearTimeout(timer8s);
    await responseSender.sendPresence?.(chatId, 'paused');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main webhook processor
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Process webhook - main entry point
 */
export async function processWebhook(
  payload: WebhookPayload,
  expectedInstanceToken: string,
  userRegistry: UserRegistry,
  sourceStore: SourceMessageStore,
  piClient: PiClient,
  responseSender: ResponseSender
): Promise<ProcessedResult> {
  // Step 1: Validate event type (only process Message events)
  const eventValidation = validateEventType(payload);
  if (!eventValidation.valid) {
    return { success: true, classification: { type: 'ignored' }, reason: eventValidation.reason };
  }

  // Step 2: Validate instance token
  const tokenValidation = validateInstanceToken(payload, expectedInstanceToken);
  if (!tokenValidation.valid) {
    return { success: false, classification: { type: 'ignored' }, reason: tokenValidation.reason };
  }

  // Step 3: Ignore own messages
  if (payload.data.Info.IsFromMe) {
    return { success: true, classification: { type: 'ignored' }, reason: 'mensagem própria ignorada' };
  }

  // Step 4: Validate group only for group chats
  if (payload.data.Info.IsGroup) {
    const groupValidation = validateGroup(payload, userRegistry);
    if (!groupValidation.valid) {
      return { success: false, classification: { type: 'ignored' }, reason: groupValidation.reason };
    }
  }

  // Step 5: Validate sender
  const senderValidation = validateSender(payload, userRegistry);
  if (!senderValidation.valid) {
    return { success: false, classification: { type: 'ignored' }, reason: senderValidation.reason };
  }

  // Step 6: Build source message
  const sourceMsg = buildSourceMessage(payload);

  // Step 7: Check idempotency
  if (sourceStore.isProcessed(sourceMsg.providerMessageId)) {
    return { success: true, classification: { type: 'ignored' }, sourceMessageId: sourceMsg.id, reason: 'mensagem duplicada' };
  }

  // Step 8: Classify message
  const classification = classifyMessage(sourceMsg.text);
  sourceMsg.classification = classification;

  // Step 9: Handle classification
  switch (classification.type) {
    case 'ignored':
      // Mark as processed but don't respond
      sourceStore.markProcessed(sourceMsg);
      return { success: true, classification, sourceMessageId: sourceMsg.id };

    case 'clarification_needed':
      return withHybridProgress(sourceMsg.remoteJid, responseSender, async () => {
        const response = generateClarificationPrompt(classification.missingInfo);
        sourceMsg.tedResponse = response;
        await responseSender.send(sourceMsg.remoteJid, response);
        sourceStore.markProcessed(sourceMsg);
        return { success: true, classification, response, sourceMessageId: sourceMsg.id };
      });

    case 'command':
    case 'financial_detected':
    case 'general':
      return withHybridProgress(sourceMsg.remoteJid, responseSender, async () => {
        // Forward to Pi/TED (general covers all non-financial human conversation)
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

            if (classification.type === 'general' && tedResult.reason === PI_RPC_DISABLED_REASON) {
              sourceMsg.tedResponse = GENERAL_FALLBACK_MESSAGE;
              await responseSender.send(sourceMsg.remoteJid, GENERAL_FALLBACK_MESSAGE);
            } else {
              await responseSender.send(sourceMsg.remoteJid, `❌ ${tedResult.reason || 'erro'}`);
            }
          }
          sourceStore.markProcessed(sourceMsg);
          return { success: true, classification, response: sourceMsg.tedResponse, sourceMessageId: sourceMsg.id };
        } catch (error) {
          sourceMsg.errorReason = error instanceof Error ? error.message : 'erro desconhecido';
          sourceStore.saveError(sourceMsg.providerMessageId, sourceMsg.errorReason);
          return { success: false, classification, reason: sourceMsg.errorReason, sourceMessageId: sourceMsg.id };
        }
      });
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
  sendPresence?(chatId: string, state: 'composing' | 'paused'): Promise<void>;
}
