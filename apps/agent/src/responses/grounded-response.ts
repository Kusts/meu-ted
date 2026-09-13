import type { EvidenceEnvelope } from '../evidence/evidence-envelope.js';
import { validateGroundedClaims } from '../evidence/grounding-validator.js';
import { renderUnavailable } from './deterministic-responses.js';

export type GroundedResponse = Readonly<{ text: string; grounded: boolean; rejected: boolean }>;

export const createGroundedResponse = (text: string, evidence: EvidenceEnvelope, fallbackSubject = 'esta consulta'): GroundedResponse => {
  const result = validateGroundedClaims(text, evidence);
  return result.valid ? { text, grounded: true, rejected: false } : { text: renderUnavailable(fallbackSubject), grounded: false, rejected: true };
};
