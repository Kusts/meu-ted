import { createEvidenceEnvelope, type EvidenceEnvelope, type EvidenceItem } from './evidence-envelope.js';

export type EvidenceSource = Omit<EvidenceItem, 'status'> & { data: unknown };
export type EvidenceRequest = {
  required: boolean;
  fetch: () => Promise<readonly EvidenceSource[] | EvidenceSource>;
  allowedFields?: readonly string[];
};

export const collectEvidence = async (request: EvidenceRequest): Promise<EvidenceEnvelope> => {
  try {
    const result = await request.fetch();
    const sources = Array.isArray(result) ? result : [result];
    const items = sources.length === 0 ? [{ ref: 'empty', source: 'tool', retrievedAt: new Date().toISOString(), status: 'empty' as const, data: [] }] : sources.map((source) => ({ ...source, status: source.data == null || (Array.isArray(source.data) && source.data.length === 0) ? 'empty' : 'ok' } as EvidenceItem));
    return createEvidenceEnvelope(items, { allowedFields: request.allowedFields });
  } catch {
    if (request.required) {
      const error = new Error('Required evidence is unavailable');
      Object.assign(error, { code: 'evidence.unavailable' });
      throw error;
    }
    return createEvidenceEnvelope([{ ref: 'unavailable', source: 'tool', retrievedAt: new Date().toISOString(), status: 'error', data: null }]);
  }
};
