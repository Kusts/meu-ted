// ─────────────────────────────────────────────────────────────────────────────
// Evolution GO Client - Sends messages via Evolution GO API
// ─────────────────────────────────────────────────────────────────────────────
import type { ResponseSender } from './webhook-handler.js';

export interface EvolutionClientOptions {
  baseUrl: string;
  instanceToken: string;
}

export interface SendTextRequest {
  number: string; // Phone number or group JID
  text: string;
  delay?: number;
}

export interface SendTextResponse {
  data: {
    Info: {
      Chat: string;
      Sender: string;
      IsFromMe: boolean;
      ID: string;
      Type: string;
      Timestamp: string;
    };
    Message: {
      extendedTextMessage?: { text: string };
      conversation?: string;
    };
  };
  message: string;
}

/**
 * Evolution GO API Client
 *
 * Auth: instance token via `apikey` header
 * Endpoint: POST /send/text (no instance name in path — instance is resolved by token)
 */
export class EvolutionClient implements ResponseSender {
  constructor(private options: EvolutionClientOptions) {}

  /**
   * Send text message to number or group
   */
  async sendText(request: SendTextRequest): Promise<SendTextResponse> {
    const response = await fetch(
      `${this.options.baseUrl}/send/text`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': this.options.instanceToken,
        },
        body: JSON.stringify({
          number: request.number,
          text: request.text,
          delay: request.delay ?? 0,
        }),
      }
    );

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Evolution GO API error: ${response.status} ${response.statusText} — ${body}`);
    }

    return response.json() as Promise<SendTextResponse>;
  }

  /**
   * Send message to group (implements ResponseSender)
   */
  async send(groupId: string, message: string): Promise<void> {
    await this.sendText({ number: groupId, text: message });
  }

  /**
   * Send presence (typing indicator) via Evolution GO API
   */
  async sendPresence(
    requestOrNumber: {
      number: string;
      state: 'composing' | 'paused';
      isAudio?: boolean;
    } | string,
    state?: 'composing' | 'paused'
  ): Promise<void> {
    const request = typeof requestOrNumber === 'string'
      ? { number: requestOrNumber, state: state ?? 'composing', isAudio: false }
      : requestOrNumber;

    const response = await fetch(
      `${this.options.baseUrl}/message/presence`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': this.options.instanceToken,
        },
        body: JSON.stringify({
          number: request.number,
          state: request.state,
          isAudio: request.isAudio ?? false,
        }),
      }
    );

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Evolution GO API error: ${response.status} ${response.statusText} — ${body}`);
    }
  }
}

/**
 * In-memory fake for testing
 */
export class FakeEvolutionClient implements ResponseSender {
  public sentMessages: Array<{ groupId: string; message: string }> = [];
  public presenceCalls: Array<{ chatId: string; state: 'composing' | 'paused' }> = [];
  public shouldFail = false;

  async send(groupId: string, message: string): Promise<void> {
    if (this.shouldFail) {
      throw new Error('Fake Evolution client configured to fail');
    }
    this.sentMessages.push({ groupId, message });
  }

  async sendPresence(chatId: string, state: 'composing' | 'paused'): Promise<void> {
    if (this.shouldFail) {
      throw new Error('Fake Evolution client configured to fail');
    }
    this.presenceCalls.push({ chatId, state });
  }

  reset(): void {
    this.sentMessages = [];
    this.presenceCalls = [];
    this.shouldFail = false;
  }
}
