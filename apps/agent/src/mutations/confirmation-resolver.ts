export type ConfirmationDecision = { kind: 'confirm' | 'cancel' | 'clarify'; operationId?: string; reason?: string };

const affirmative = /^(sim|s[ií]m|confirmo|confirmado|pode|pode sim|autorizo|vai em frente|ok|okay|fechado)[!. ]*$/i;
const negative = /\b(n[aã]o|não|cancela|cancelar|deixa|desist|pare)\b/i;

/** Resolves confirmation text without reconstructing or modifying proposal arguments. */
export const resolveConfirmation = (text: string, pendingOperationIds: readonly string[]): ConfirmationDecision => {
  if (negative.test(text)) return { kind: 'cancel', reason: 'explicit_negation' };
  if (!affirmative.test(text.trim())) return { kind: 'clarify', reason: 'not_explicit_confirmation' };
  if (pendingOperationIds.length !== 1) return { kind: 'clarify', reason: pendingOperationIds.length === 0 ? 'no_pending_operation' : 'multiple_pending_operations' };
  return { kind: 'confirm', operationId: pendingOperationIds[0] };
};
