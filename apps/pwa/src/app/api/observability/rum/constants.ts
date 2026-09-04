// RUM ingest limits — extracted from route.ts so Next.js route type validation passes.
// Next.js 16 route files only allow specific exports; arbitrary constants must live outside the route.

export const RUM_MAX_BODY_BYTES = 1024;

export const RUM_RATE_LIMIT = { limit: 30, windowMs: 60_000 } as const;
