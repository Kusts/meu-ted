import type { EvidenceEnvelope } from '../evidence/evidence-envelope.js';
import { validateGroundedClaims } from '../evidence/grounding-validator.js';
import { emitSanitizedEvent } from '../observability/events.js';
import { renderUnavailable } from './deterministic-responses.js';

export type GroundedResponse = Readonly<{ text: string; grounded: boolean; rejected: boolean }>;
export type GroundingEventSink = (eventType: string, fields: Record<string, unknown>) => void;

const defaultSink: GroundingEventSink = (eventType, fields) => {
  emitSanitizedEvent(eventType, fields);
};

export const createGroundedResponse = (text: string, evidence: EvidenceEnvelope, fallbackSubject = 'esta consulta'): GroundedResponse => {
  const result = validateGroundedClaims(text, evidence);
  return result.valid ? { text, grounded: true, rejected: false } : { text: renderUnavailable(fallbackSubject), grounded: false, rejected: true };
};

export type GroundedRetryOptions = Readonly<{
  fallbackSubject?: string;
  /** ONE structured correction retry: called with the unsupported claims, returns revised text or null. */
  retry?: (unsupportedClaims: readonly string[]) => Promise<string | null>;
  sink?: GroundingEventSink;
  intentionId?: string;
  traceId?: string;
}>;

/**
 * Read-path grounding with ONE structured correction retry. A second
 * failure falls back to a safe deterministic response and emits
 * `agent.grounding.rejected` with allowlisted fields only (counts and
 * sanitized codes — never the raw model text or financial payload).
 */
export const createGroundedResponseWithRetry = async (
  text: string,
  evidence: EvidenceEnvelope,
  options: GroundedRetryOptions = {},
): Promise<GroundedResponse> => {
  const sink = options.sink ?? defaultSink;
  const fallbackSubject = options.fallbackSubject ?? 'esta consulta';
  const first = validateGroundedClaims(text, evidence);
  if (first.valid) return { text, grounded: true, rejected: false };
  if (options.retry) {
    try {
      const revised = await options.retry(first.unsupportedClaims);
      if (typeof revised === 'string' && revised.trim().length > 0) {
        const second = validateGroundedClaims(revised, evidence);
        if (second.valid) return { text: revised, grounded: true, rejected: false };
        sink('agent.grounding.rejected', {
          ...(options.intentionId ? { intentionId: options.intentionId } : {}),
          ...(options.traceId ? { traceId: options.traceId } : {}),
          status: 'rejected_after_retry',
          unsupportedCount: second.unsupportedClaims.length,
        });
        return { text: renderUnavailable(fallbackSubject), grounded: false, rejected: true };
      }
    } catch {
      // A retry failure is operational: fall through to the safe fallback.
    }
  }
  sink('agent.grounding.rejected', {
    ...(options.intentionId ? { intentionId: options.intentionId } : {}),
    ...(options.traceId ? { traceId: options.traceId } : {}),
    status: 'rejected',
    unsupportedCount: first.unsupportedClaims.length,
  });
  return { text: renderUnavailable(fallbackSubject), grounded: false, rejected: true };
};
