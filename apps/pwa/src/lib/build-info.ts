/**
 * V4.1 Phase 9 (Task 9.9) — PWA release identity.
 *
 * Static env references (bundled at build time): the deploy pipeline sets
 * NEXT_PUBLIC_BUILD_SHA / NEXT_PUBLIC_BUILD_ID / NEXT_PUBLIC_BUILD_TIME so
 * the shipped bundle carries the identity of the exact commit it was built
 * from. Absent in dev → explicit "dev" fallbacks, never empty/undefined.
 * The production smoke (Task 9.10) confirms the deployed SHA via
 * GET /api/build-info.
 */

export type BuildInfo = {
  gitSha: string;
  buildId: string;
  builtAt: string;
};

export function getBuildInfo(env?: {
  NEXT_PUBLIC_BUILD_SHA?: string;
  NEXT_PUBLIC_BUILD_ID?: string;
  NEXT_PUBLIC_BUILD_TIME?: string;
}): BuildInfo {
  // Static `process.env.NEXT_PUBLIC_*` references are required so Next.js
  // inlines the values at build time (Task 5.4 rule: no dynamic env access —
  // an indirect `source` object is never replaced in the bundle).
  const source = env ?? {
    NEXT_PUBLIC_BUILD_SHA: process.env.NEXT_PUBLIC_BUILD_SHA,
    NEXT_PUBLIC_BUILD_ID: process.env.NEXT_PUBLIC_BUILD_ID,
    NEXT_PUBLIC_BUILD_TIME: process.env.NEXT_PUBLIC_BUILD_TIME,
  };
  // `||` (not `??`): a set-but-empty build var is as uninformative as absent.
  return {
    gitSha: source.NEXT_PUBLIC_BUILD_SHA || "dev",
    buildId: source.NEXT_PUBLIC_BUILD_ID || "dev",
    builtAt: source.NEXT_PUBLIC_BUILD_TIME || "dev",
  };
}
