import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { createSourceMessageStore } from './source-message-store.js';
import type { SourceMessage } from './webhook-handler.js';

function makeMessage(id: string): SourceMessage {
  return {
    id: `msg-${id}`,
    providerMessageId: id,
    remoteJid: '5511999999999@s.whatsapp.net',
    fromMe: false,
    text: 'oi',
    senderPhone: '5511999999999',
    timestamp: 1710000000,
    processed: true,
  };
}

describe('createSourceMessageStore', () => {
  it('keeps dedupe after store recreation', () => {
    const dir = mkdtempSync(join(process.cwd(), 'tmp-dedupe-'));
    const path = join(dir, 'dedupe-store.json');

    try {
      const first = createSourceMessageStore(path);
      first.markProcessed(makeMessage('provider-1'));
      expect(first.isProcessed('provider-1')).toBe(true);

      const restarted = createSourceMessageStore(path);
      expect(restarted.isProcessed('provider-1')).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
