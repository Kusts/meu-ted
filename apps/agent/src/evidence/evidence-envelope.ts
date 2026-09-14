export type EvidenceStatus = 'ok' | 'empty' | 'error';

export type EvidenceItem = Readonly<{
  ref: string;
  source: string;
  retrievedAt: string;
  status: EvidenceStatus;
  data: unknown;
}>;

export type EvidenceEnvelope = Readonly<{
  version: '1';
  items: readonly EvidenceItem[];
}>;

const MAX_PAYLOAD_BYTES = 10_000;
const technicalFields = new Set(['workspaceId', 'actorId', 'deviceId', 'token', 'accessToken', 'authorization', 'headers', 'internalId', 'id']);

const project = (value: unknown, allowed?: readonly string[]): unknown => {
  if (Array.isArray(value)) return value.map((item) => project(item, allowed));
  if (!value || typeof value !== 'object') return value;
  const output: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (technicalFields.has(key) || (allowed && !allowed.includes(key))) continue;
    output[key] = project(child, allowed);
  }
  return output;
};

const deepFreeze = <T>(value: T): T => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
};

export type EvidenceInput = Omit<EvidenceItem, 'status'> & { status?: EvidenceStatus };

export const createEvidenceEnvelope = (items: readonly EvidenceInput[], options: { allowedFields?: readonly string[] } = {}): EvidenceEnvelope => {
  const projected = items.map((item) => {
    if (!item.ref || !item.source || Number.isNaN(Date.parse(item.retrievedAt))) throw new Error('evidence.invalid');
    const status = item.status ?? (item.data == null ? 'empty' : 'ok');
    if (!['ok', 'empty', 'error'].includes(status)) throw new Error('evidence.invalid');
    return { ref: item.ref, source: item.source, retrievedAt: item.retrievedAt, status, data: project(item.data, options.allowedFields) } satisfies EvidenceItem;
  });
  const envelope = { version: '1', items: projected } satisfies EvidenceEnvelope;
  if (new TextEncoder().encode(JSON.stringify(envelope)).byteLength > MAX_PAYLOAD_BYTES) throw new Error('evidence.payload_too_large');
  return deepFreeze(envelope);
};

export const isCurrentEvidence = (item: EvidenceItem, now = Date.now(), maxAgeMs = 5 * 60_000): boolean => {
  const timestamp = Date.parse(item.retrievedAt);
  return item.status === 'ok' && Number.isFinite(timestamp) && timestamp <= now && now - timestamp <= maxAgeMs;
};

/** Safe, minimal representation for a provider prompt; technical metadata is not forwarded. */
export const serializeEvidenceForPrompt = (envelope: EvidenceEnvelope): string => JSON.stringify({
  items: envelope.items.filter((item) => item.status === 'ok').map((item) => ({ retrievedAt: item.retrievedAt, data: item.data })),
});
