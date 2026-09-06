import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Constant-shape token comparison (Fase 3 item 7). Both inputs are hashed
 * with SHA-256 first, so `timingSafeEqual` always compares 32-byte digests:
 * there is no length early-return and no length-dependent branch, hence no
 * size side-channel. Empty/missing tokens are always rejected.
 */
export const safeCompareTokens = (a: string, b: string): boolean => {
  if (!a || !b) return false;
  const digest = (s: string) => createHash('sha256').update(s, 'utf8').digest();
  return timingSafeEqual(digest(a), digest(b));
};
