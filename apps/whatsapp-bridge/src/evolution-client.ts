// ─────────────────────────────────────────────────────────────────────────────
// Evolution Client - Sends messages via Evolution API
// ─────────────────────────────────────────────────────────────────────────────

import type { ResponseSender } from './webhook-handler.js';

export interface EvolutionClientOptions {
  baseUrl: string;
  instanceName: string;
  apiToken: string;
}

export interface SendTextRequest {
  number: string; // Phone number or group JID
  text: string;
  delay?: number;
}

export interface SendTextResponse {
  key: {
    id: string;
    remoteJid: string;
    fromMe: boolean;
  };
  message?: {
    conversation?: string;
  };
}

/**
 * Evolution API Client
 */
export class EvolutionClient implements ResponseSender {
  constructor(private options: EvolutionClientOptions) {}

  /**
   * Send text message to number or group
   */
  async sendText(request: SendTextRequest): Promise<SendTextResponse> {
    const response = await fetch(
      `${this.options.baseUrl}/message/sendText/${this.options.instanceName}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': this.options.apiToken,
        },
        body: JSON.stringify({
          number: request.number,
          text: request.text,
          delay: request.delay ?? 0,
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`Evolution API error: ${response.status} ${response.statusText}`);
    }

    return response.json() as Promise<SendTextResponse>;
  }

  /**
   * Send message to group (implements ResponseSender)
   */
  async send(groupId: string, message: string): Promise<void> {
    await this.sendText({ number: groupId, text: message });
  }
}

/**
 * In-memory fake for testing
 */
export class FakeEvolutionClient implements ResponseSender {
  public sentMessages: Array<{ groupId: string; message: string }> = [];
  public shouldFail = false;

  async send(groupId: string, message: string): Promise<void> {
    if (this.shouldFail) {
      throw new Error('Fake Evolution client configured to fail');
    }
    this.sentMessages.push({ groupId, message });
  }

  reset(): void {
    this.sentMessages = [];
    this.shouldFail = false;
  }
}