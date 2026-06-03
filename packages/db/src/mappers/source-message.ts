// ─────────────────────────────────────────────────────────────────────────────
// SourceMessage Mapper
// Maps between Drizzle DB rows and domain SourceMessage type
// ─────────────────────────────────────────────────────────────────────────────

export interface DbSourceMessage {
  id: string;
  householdId: string;
  provider: string;
  groupId: string | null;
  senderPhone: string;
  providerMessageId: string;
  contentHash: string | null;
  text: string | null;
  processedAt: Date | null;
  errorReason: string | null;
  createdAt: Date;
}

export interface SourceMessage {
  id: string;
  householdId: string;
  provider: string;
  groupId: string | null;
  senderPhone: string;
  providerMessageId: string;
  contentHash: string | null;
  text: string | null;
  processedAt: string | null;
  errorReason: string | null;
  createdAt: string;
}

export function fromDbSourceMessage(row: DbSourceMessage): SourceMessage {
  return {
    id: row.id,
    householdId: row.householdId,
    provider: row.provider,
    groupId: row.groupId,
    senderPhone: row.senderPhone,
    providerMessageId: row.providerMessageId,
    contentHash: row.contentHash,
    text: row.text,
    processedAt: row.processedAt ? row.processedAt.toISOString() : null,
    errorReason: row.errorReason,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toDbSourceMessage(msg: SourceMessage): DbSourceMessage {
  return {
    id: msg.id,
    householdId: msg.householdId,
    provider: msg.provider,
    groupId: msg.groupId,
    senderPhone: msg.senderPhone,
    providerMessageId: msg.providerMessageId,
    contentHash: msg.contentHash,
    text: msg.text,
    processedAt: msg.processedAt ? new Date(msg.processedAt) : null,
    errorReason: msg.errorReason,
    createdAt: new Date(msg.createdAt),
  };
}