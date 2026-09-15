import { formatCents } from '../evidence/financial-formatters.js';

export const renderBalance = (value: { accountName: string; balanceCents: number }): string => `${value.accountName}: ${formatCents(value.balanceCents)}.`;
export const renderEmpty = (subject: string): string => `Não há dados disponíveis para ${subject}.`;
export const renderUnavailable = (subject: string): string => `Não foi possível consultar ${subject} agora. Tente novamente mais tarde.`;

/**
 * TEDV3-003 remediation: deterministic clarification used when the tool-call
 * sanitizer removed EVERY useful token of the model reply (the message was
 * pure tool-invocation markup). Never an empty message, never raw markup:
 * one short natural-language question inviting the user to rephrase. It
 * ends in "?" so the SPEC §26.3 clarification contract still holds when
 * small models persist in emitting tool-call markup on ambiguous reads.
 */
export const renderClarificationFallback = (subject = 'esta consulta'): string =>
  `Não consegui processar ${subject} agora. Você pode reformular o que deseja consultar?`;

/**
 * T3.1 fail-closed financeiro (SPEC §14 H-06): evidence null, timeout ou
 * todos os EvidenceItems com error → esta resposta determinística, sem
 * chamar o LLM. Wording fixo da SPEC, nunca número inventado.
 */
export const FINANCIAL_EVIDENCE_UNAVAILABLE_TEXT =
  'Não consegui acessar seus dados financeiros agora. Tente novamente em instantes.';
export const renderSuccess = (subject: string): string => `${subject} concluído com sucesso.`;
export const renderFailure = (subject: string): string => `Não foi possível concluir ${subject}.`;

export type StatementEntry = Readonly<{
  description: string;
  date: string;
  amountCents: number;
}>;

const isStatementEntry = (value: unknown): value is StatementEntry => {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Record<string, unknown>;
  return typeof entry.description === 'string' && typeof entry.date === 'string' && typeof entry.amountCents === 'number';
};

/** Deterministic statement list: every line comes from evidence, totals are computed in code. */
export const renderStatement = (entries: readonly unknown[], subject = 'extrato'): string => {
  const valid = entries.filter(isStatementEntry);
  if (valid.length === 0) return renderEmpty(subject);
  const lines = valid.slice(0, 20).map((entry) => `- ${entry.date} ${entry.description}: ${formatCents(entry.amountCents)}`);
  return `${subject}:\n${lines.join('\n')}`;
};

export type MutationOutcome = 'proposed' | 'succeeded' | 'failed' | 'cancelled' | 'expired';

/**
 * Inconclusive handoff reply (SPEC §7.8/INV-10): the propose outcome is
 * unknown, so the turn claims neither success nor cancellation. Fixed
 * wording, never model text.
 */
export const renderInconclusive = (subject = 'operação'): string =>
  `A ${subject} está em processamento e ainda não foi concluída. Nada foi criado ou cancelado ainda — tente novamente em instantes.`;

/** Deterministic mutation/approval result: fixed wording per outcome, never model text. */
export const renderMutationResult = (outcome: MutationOutcome, subject = 'operação'): string => {  switch (outcome) {
    case 'succeeded': return `Lançamento registrado com sucesso.`;
    case 'proposed': return `Proposta: ${subject}. Confirma?`;
    case 'cancelled': return `Operação cancelada com segurança.`;
    case 'expired': return `A aprovação expirou. Inicie a operação novamente.`;
    case 'failed': return `Não foi possível concluir a operação.`;
  }
};
