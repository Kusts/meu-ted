// ─────────────────────────────────────────────────────────────────────────────
// WhatsApp Bridge — Webhook handler
// Responsibility: validate, extract, and forward WhatsApp messages to Pi.
// NO financial classification here. The Agent Pi interprets the message.
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Evolution GO Webhook Payload
// ─────────────────────────────────────────────────────────────────────────────

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
// Public interfaces (kept stable for server.ts and tests)
// ─────────────────────────────────────────────────────────────────────────────

export type WebhookStatus = 'forwarded' | 'ignored' | 'failed';

export interface ProcessedResult {
  status: WebhookStatus;
  reason?: string;
  sourceMessageId?: string;
  response?: string;
}

export interface UserRegistry {
  isPhoneRegistered(phone: string): boolean;
  isGroupAllowed(groupId: string): boolean;
  getHouseholdIdForGroup(groupId: string): string | null;
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
  errorReason?: string;
}

export interface SourceMessageStore {
  isProcessed(providerMessageId: string): boolean;
  markProcessed(msg: SourceMessage): void;
  saveError(providerMessageId: string, error: string): void;
}

export interface ValidationResult {
  valid: boolean;
  reason?: string;
}

export interface ResponseSender {
  send(chatId: string, message: string): Promise<void>;
  sendPresence?(chatId: string, state: 'composing' | 'paused'): Promise<void>;
}

export interface PiClient {
  send(
    message: string,
    senderPhone: string,
    context: {
      source: string;
      chatId: string;
      providerMessageId: string;
      idempotencyKey?: string;
    }
  ): Promise<{ success: boolean; reason?: string; data?: { message?: string } }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────────────────

export function validateEventType(payload: WebhookPayload): ValidationResult {
  if (payload.event !== 'Message') {
    return { valid: false, reason: `evento ignorado: ${payload.event}` };
  }
  return { valid: true };
}

export function validateInstanceToken(
  payload: WebhookPayload,
  expectedToken: string
): ValidationResult {
  if (!expectedToken) return { valid: true };
  if (payload.instanceToken !== expectedToken) {
    return { valid: false, reason: 'instanceToken inválido' };
  }
  return { valid: true };
}

export function validateGroup(
  payload: WebhookPayload,
  registry: UserRegistry
): ValidationResult {
  if (!registry.isGroupAllowed(payload.data.Info.Chat)) {
    return { valid: false, reason: 'grupo não permitido' };
  }
  return { valid: true };
}

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

export function extractPhone(remoteJid: string): string {
  return remoteJid
    .replace(/@s\.whatsapp\.net$/, '')
    .replace(/@g\.us$/, '')
    .replace(/:\d+$/, '');
}

export function extractMessageText(payload: WebhookPayload): string {
  const msg = payload.data.Message;
  if (!msg) return '';
  if (msg.conversation) return msg.conversation;
  if (msg.extendedTextMessage?.text) return msg.extendedTextMessage.text;
  if (msg.imageMessage?.caption) return msg.imageMessage.caption;
  if (msg.videoMessage?.caption) return msg.videoMessage.caption;
  if (msg.documentMessage?.title) return msg.documentMessage.title;
  return '';
}

export function buildSourceMessage(payload: WebhookPayload): SourceMessage {
  const ts = new Date(payload.data.Info.Timestamp).getTime() / 1000;
  return {
    id: crypto.randomUUID(),
    providerMessageId: payload.data.Info.ID,
    remoteJid: payload.data.Info.Chat,
    fromMe: payload.data.Info.IsFromMe,
    text: extractMessageText(payload),
    senderPhone: extractPhone(payload.data.Info.Sender),
    pushName: payload.data.Info.PushName || undefined,
    timestamp: Number.isNaN(ts) ? Date.now() / 1000 : ts,
    processed: false,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Prompt builder (documented contract for the Agent Pi)
// ─────────────────────────────────────────────────────────────────────────────

export function buildBridgePrompt(
  source: SourceMessage,
  householdId: string
): string {
  const isoTimestamp = new Date(source.timestamp * 1000).toISOString();
  return [
    '[WhatsApp Message]',
    `householdId: ${householdId}`,
    `chatId: ${source.remoteJid}`,
    `senderPhone: ${source.senderPhone}`,
    `pushName: ${source.pushName ?? ''}`,
    `providerMessageId: ${source.providerMessageId}`,
    `timestamp: ${isoTimestamp}`,
    `# timestamp acima é a data padrão do gasto`,
    `source: whatsapp`,
    '',
    'User message:',
    source.text,
  ].join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// Presence helpers — fire-and-forget, never block piClient.send
// ─────────────────────────────────────────────────────────────────────────────

function firePresence(
  chatId: string,
  state: 'composing' | 'paused',
  sender: ResponseSender
): void {
  const result = sender.sendPresence?.(chatId, state);
  if (result?.catch) result.catch(() => {/* silencia erro de presence */});
}

// ─────────────────────────────────────────────────────────────────────────────
// Main processor
// ─────────────────────────────────────────────────────────────────────────────

export async function processWebhook(
  payload: WebhookPayload,
  expectedInstanceToken: string,
  userRegistry: UserRegistry,
  sourceStore: SourceMessageStore,
  piClient: PiClient,
  responseSender: ResponseSender
): Promise<ProcessedResult> {
  // 1) Only Message events
  const eventCheck = validateEventType(payload);
  if (!eventCheck.valid) {
    return { status: 'ignored', reason: eventCheck.reason };
  }

  // 2) Token
  const tokenCheck = validateInstanceToken(payload, expectedInstanceToken);
  if (!tokenCheck.valid) {
    return { status: 'failed', reason: tokenCheck.reason };
  }

  // 3) Skip own messages
  if (payload.data.Info.IsFromMe) {
    return { status: 'ignored', reason: 'mensagem própria ignorada' };
  }

  // 4) Group (only for group chats)
  if (payload.data.Info.IsGroup) {
    const groupCheck = validateGroup(payload, userRegistry);
    if (!groupCheck.valid) {
      return { status: 'failed', reason: groupCheck.reason };
    }
  }

  // 5) Sender
  const senderCheck = validateSender(payload, userRegistry);
  if (!senderCheck.valid) {
    return { status: 'failed', reason: senderCheck.reason };
  }

  // 6) Build source message
  const sourceMsg = buildSourceMessage(payload);

  // 7) Idempotency by providerMessageId
  if (sourceStore.isProcessed(sourceMsg.providerMessageId)) {
    return {
      status: 'ignored',
      sourceMessageId: sourceMsg.id,
      reason: 'mensagem duplicada',
    };
  }

  // 8) Empty text → ignore
  if (!sourceMsg.text.trim()) {
    sourceStore.markProcessed(sourceMsg);
    return { status: 'ignored', sourceMessageId: sourceMsg.id, reason: 'texto vazio' };
  }

  // 9) Fire composing (non-blocking) and call Pi
  firePresence(sourceMsg.remoteJid, 'composing', responseSender);

  const groupHousehold = userRegistry.getHouseholdIdForGroup(sourceMsg.remoteJid);
  const householdId = groupHousehold ?? process.env.DEFAULT_HOUSEHOLD_ID ?? 'default';
  const prompt = buildBridgePrompt(sourceMsg, householdId);

  // TEMP DIAGNOSTIC: log every stage
  console.log('[webhook-handler] IN  providerMessageId=', sourceMsg.providerMessageId, 'text=', sourceMsg.text.slice(0, 50));

  try {
    console.log('[webhook-handler] CALLING piClient.send()...');
    const result = await piClient.send(prompt, sourceMsg.senderPhone, {
      source: 'whatsapp',
      chatId: sourceMsg.remoteJid,
      providerMessageId: sourceMsg.providerMessageId,
      idempotencyKey: `whatsapp:${sourceMsg.providerMessageId}`,
    });
    console.log('[webhook-handler] piClient.send() returned success=', result.success, 'reason=', result.reason);

    if (result.success && result.data?.message) {
      console.log('[webhook-handler] responseSender.send() to', sourceMsg.remoteJid, 'message=', result.data.message.slice(0, 80));
      await responseSender.send(sourceMsg.remoteJid, result.data.message);
      sourceStore.markProcessed(sourceMsg);
      console.log('[webhook-handler] OUT  status=forwarded');
      return {
        status: 'forwarded',
        response: result.data.message,
        sourceMessageId: sourceMsg.id,
      };
    }

    const reason = result.reason ?? 'erro';
    sourceMsg.errorReason = reason;
    sourceStore.saveError(sourceMsg.providerMessageId, reason);
    console.log('[webhook-handler] responseSender.send() FALLBACK to', sourceMsg.remoteJid);
    await responseSender.send(sourceMsg.remoteJid, '⚠️ Tive um problema aqui. Pode tentar de novo em instantes?');
    sourceStore.markProcessed(sourceMsg);
    console.log('[webhook-handler] OUT  status=failed reason=', reason);
    return { status: 'failed', reason, sourceMessageId: sourceMsg.id };
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'erro desconhecido';
    console.error('[webhook-handler] EXCEPTION:', reason);
    sourceMsg.errorReason = reason;
    sourceStore.saveError(sourceMsg.providerMessageId, reason);
    return { status: 'failed', reason, sourceMessageId: sourceMsg.id };
  } finally {
    firePresence(sourceMsg.remoteJid, 'paused', responseSender);
  }
}
