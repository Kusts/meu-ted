import { describe, expect, it } from 'vitest';
import { collectEvidence, type EvidenceSource } from '../../src/evidence/evidence-collector.js';
import { createEvidenceEnvelope, isCurrentEvidence, serializeEvidenceForPrompt, type EvidenceItem } from '../../src/evidence/evidence-envelope.js';

const source: EvidenceSource = {
  ref: 'balance-current', source: 'api.balance', retrievedAt: '2026-09-13T12:00:00.000Z',
  data: { balanceCents: 12345, accountName: 'Conta principal', workspaceId: 'secret-ws' },
};

describe('T2.3 evidence envelope', () => {
  it('validates typed evidence, projects allowed fields and redacts technical identifiers', () => {
    const envelope = createEvidenceEnvelope([source], { allowedFields: ['balanceCents', 'accountName'] });
    expect(envelope.items[0]?.data).toEqual({ balanceCents: 12345, accountName: 'Conta principal' });
    expect(JSON.stringify(envelope)).not.toContain('secret-ws');
    expect(Object.isFrozen(envelope)).toBe(true);
  });

  it('represents empty results and required unavailable tools without inventing values', async () => {
    const empty = await collectEvidence({ required: false, fetch: async () => [] });
    expect(empty.items[0]?.status).toBe('empty');
    await expect(collectEvidence({ required: true, fetch: async () => { throw new Error('timeout'); } }))
      .rejects.toMatchObject({ code: 'evidence.unavailable' });
  });

  it('rejects oversized payloads instead of string truncating malformed JSON', () => {
    expect(() => createEvidenceEnvelope([{ ...source, data: { value: 'x'.repeat(10001) } }]))
      .toThrow('evidence.payload_too_large');
  });

  it('accepts explicitly dated snapshots as current evidence metadata', () => {
    const item: EvidenceItem = { ref: 'snapshot-1', source: 'api.balance', retrievedAt: '2026-09-13T12:00:00.000Z', status: 'ok', data: { balanceCents: 100 } };
    expect(createEvidenceEnvelope([item]).items[0]?.retrievedAt).toBe(item.retrievedAt);
    expect(isCurrentEvidence(item, Date.parse('2026-09-13T12:04:00Z'))).toBe(true);
    expect(isCurrentEvidence(item, Date.parse('2026-09-13T12:06:00Z'))).toBe(false);
    const prompt = serializeEvidenceForPrompt(createEvidenceEnvelope([item]));
    expect(prompt).not.toContain('snapshot-1');
    expect(prompt).not.toContain('api.balance');
  });
});
