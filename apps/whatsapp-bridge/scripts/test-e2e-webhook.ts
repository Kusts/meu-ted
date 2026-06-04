/**
 * Phase 6 Slice 5 — E2E Webhook Test
 *
 * Tests the complete flow:
 * WhatsApp webhook → processWebhook() → Pi agent → financial tool execution → response
 *
 * Run: npx tsx apps/whatsapp-bridge/scripts/test-e2e-webhook.ts
 */

import { resolve, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { existsSync } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Find REPO_ROOT
let REPO_ROOT = resolve(__dirname, '../../..');
if (!existsSync(resolve(REPO_ROOT, 'package.json'))) REPO_ROOT = resolve(__dirname, '../../../..');
console.log('REPO_ROOT:', REPO_ROOT);

async function main() {
  console.log('=== Phase 6 Slice 5: E2E Webhook Test ===\n');

  // Simulate the webhook flow without starting a server
  const webhookHandlerPath = pathToFileURL(resolve(REPO_ROOT, 'apps/whatsapp-bridge/src/webhook-handler.js')).href;
  const piClientFactoryPath = pathToFileURL(resolve(REPO_ROOT, 'apps/whatsapp-bridge/src/pi-client-factory.js')).href;
  const { processWebhook, buildBridgePrompt } = await import(webhookHandlerPath);
  const { createPiClient } = await import(piClientFactoryPath);

  // Define WebhookPayload inline (same shape as webhook-handler.ts)
  interface WebhookPayload {
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
      Message: { conversation?: string; extendedTextMessage?: { text: string }; [key: string]: unknown };
    };
  }

  // Build a fake WhatsApp webhook payload
  const householdId = '550e8400-e29b-41d4-a716-446655440000';
  const fakePayload: WebhookPayload = {
    event: 'Message',
    instanceId: 'test-instance',
    instanceToken: 'test-token',
    data: {
      Info: {
        Chat: '120363045678901234@g.us',
        Sender: '5511999999999@s.whatsapp.net',
        IsFromMe: false,
        IsGroup: true,
        ID: `msg-${Date.now()}`,
        Type: 'text',
        PushName: 'Test User',
        Timestamp: String(Math.floor(Date.now() / 1000)),
      },
      Message: {
        conversation: 'List the accounts for this household',
      },
    },
  };

  // Mock user registry
  const mockRegistry = {
    isPhoneRegistered: (_phone: string) => true,
    isGroupAllowed: (_groupId: string) => true,
    getHouseholdIdForGroup: (_groupId: string) => householdId,
  };

  // Mock source message store
  const seenMessages = new Set<string>();
  const mockStore = {
    isProcessed: (providerMessageId: string) => seenMessages.has(providerMessageId),
    markProcessed: (msg: { providerMessageId: string }) => { seenMessages.add(msg.providerMessageId); },
    saveError: (providerMessageId: string, reason: string) => { console.log('Error:', providerMessageId, reason); },
  };

  // Mock response sender
  const sentResponses: Array<{ chatId: string; text: string }> = [];
  const mockSender = {
    sent: sentResponses,
    send: async (chatId: string, text: string) => {
      sentResponses.push({ chatId, text });
      console.log('📤 Response sent to', chatId + ':', text.slice(0, 200));
    },
    sendPresence: async (_chatId: string, _state: 'composing' | 'paused') => {},
  };

  // Create Pi client (uses PI_AGENT_RUNTIME env — set to 'disabled' to use FakePiClient)
  const runtime = process.env.PI_AGENT_RUNTIME ?? 'disabled';
  console.log('Pi runtime:', runtime);

  if (runtime === 'disabled') {
    console.log('⚠️ PI_AGENT_RUNTIME=disabled — using FakePiClient (no real Pi execution)');
    console.log('   Set PI_AGENT_RUNTIME=pi-native to test real Pi with financial-tools extension');
  }

  const piClient = createPiClient(householdId);
  console.log('Pi client created');

  // Process the webhook
  console.log('\n--- Processing webhook ---');
  console.log('Payload:', JSON.stringify({
    event: fakePayload.event,
    chat: fakePayload.data.Info.Chat,
    sender: fakePayload.data.Info.Sender,
    text: fakePayload.data.Message.conversation,
  }));

  const result = await processWebhook(
    fakePayload,
    'test-token',  // expectedInstanceToken
    mockRegistry,
    mockStore,
    piClient,
    mockSender,
  );

  console.log('\n--- Result ---');
  console.log('Status:', result.status);
  console.log('Reason:', result.reason ?? '(none)');
  console.log('Response:', result.response?.slice(0, 500) ?? '(none)');

  if (runtime === 'pi-native') {
    if (result.status === 'forwarded' && result.response && sentResponses.length > 0) {
      console.log('\n✅ E2E SUCCESS: Webhook processed and Pi responded!');
      console.log('   Response includes:', sentResponses[0].text.slice(0, 300));
    } else {
      console.log('\n⚠️ E2E PARTIAL: Status =', result.status);
    }
  } else {
    if (result.status === 'forwarded' && result.response?.includes('disabled')) {
      console.log('\n✅ E2E OK: Bridge processed correctly, Pi disabled as expected');
    }
  }

  // Cleanup
  if ('stop' in piClient && typeof piClient.stop === 'function') {
    await (piClient as { stop: () => Promise<void> }).stop();
  }
}

main().catch(err => {
  console.error('❌ Failed:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});