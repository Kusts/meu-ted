/**
 * Same-origin CSP violation ingest (POST /api/csp-report).
 *
 * V4 T2.7 / T0.4.8 (SPEC §24.8): the production CSP points report-uri here
 * so bypass attempts against the same-origin topology stay visible without
 * any new platform — a bounded structured log the V4 report can query.
 *
 * Contract: payload minimum (effectiveDirective, host of blockedURL WITHOUT
 * query/path, disposition, statusCode), strict lightweight zod validation in
 * the spirit of the API events contract, credential-free sanitization,
 * bounded sampled logging (max N/min structured console), and 204 ALWAYS
 * for the browser (errors never leak).
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { shouldLogCspViolation } from "./sampling";

const MAX_BODY_BYTES = 8_192;

/** Known keys of the legacy `csp-report` envelope; unknown keys are dropped. */
const legacyReportSchema = z
  .object({
    "blocked-uri": z.string().max(2048).optional(),
    "effective-directive": z.string().max(128).optional(),
    "violated-directive": z.string().max(256).optional(),
    disposition: z.string().max(32).optional(),
    "status-code": z.number().int().min(0).max(999).optional(),
  })
  .catchall(z.unknown());

const legacyEnvelopeSchema = z.object({ "csp-report": legacyReportSchema });

/** Reporting API (report-to) shape: [{ type, body: {...} }]. */
const reportingApiItemSchema = z
  .object({
    type: z.string().max(64).optional(),
    body: z
      .object({
        blockedURL: z.string().max(2048).optional(),
        effectiveDirective: z.string().max(128).optional(),
        disposition: z.string().max(32).optional(),
      })
      .catchall(z.unknown())
      .optional(),
  })
  .catchall(z.unknown());

function noStoreHeaders(): Headers {
  const headers = new Headers();
  headers.set("cache-control", "no-store");
  headers.set("cdn-cache-control", "no-store");
  return headers;
}

/**
 * Reduce any blocked URL to a credential-free host token: hostname only
 * (no path, query, fragment, userinfo), short scheme keywords passed
 * through, everything else collapsed to "invalid". Never throws.
 */
function hostOf(raw: string | undefined): string {
  if (!raw) return "none";
  const token = raw.trim().slice(0, 64);
  if (/^(self|none|inline|eval|about|data|blob|mediastream|filesystem)$/i.test(token)) {
    return token.toLowerCase();
  }
  if (/^(data|blob|about):/i.test(token)) {
    return token.split(":")[0]!.toLowerCase();
  }
  try {
    const parsed = new URL(token);
    const host = parsed.hostname.slice(0, 253);
    if (!host) return "invalid";
    if (/[^a-z0-9.:[\]-]/i.test(host)) return "invalid";
    return host.toLowerCase();
  } catch {
    return "invalid";
  }
}

function directiveOf(raw: string | undefined): string {
  if (!raw) return "unknown";
  const first = raw.trim().split(/\s+/)[0] ?? "";
  if (!/^[a-z-]+$/i.test(first)) return "unknown";
  return first.toLowerCase().slice(0, 64);
}

function dispositionOf(raw: string | undefined): string {
  return raw === "enforce" || raw === "report" ? raw : "unknown";
}

function statusOf(raw: number | undefined): number | undefined {
  return typeof raw === "number" && Number.isInteger(raw) ? raw : undefined;
}

type SanitizedViolation = {
  effectiveDirective: string;
  blockedHost: string;
  disposition: string;
  statusCode?: number;
};

function sanitize(body: unknown): SanitizedViolation | null {
  if (typeof body !== "object" || body === null) return null;
  const legacy = legacyEnvelopeSchema.safeParse(body);
  if (legacy.success) {
    const report = legacy.data["csp-report"];
    return {
      effectiveDirective: directiveOf(
        report["effective-directive"] ?? report["violated-directive"],
      ),
      blockedHost: hostOf(report["blocked-uri"]),
      disposition: dispositionOf(report.disposition),
      ...(statusOf(report["status-code"]) !== undefined
        ? { statusCode: statusOf(report["status-code"]) as number }
        : {}),
    };
  }
  if (Array.isArray(body)) {
    const first = reportingApiItemSchema.safeParse(body[0]);
    if (!first.success || !first.data.body) return null;
    return {
      effectiveDirective: directiveOf(first.data.body.effectiveDirective),
      blockedHost: hostOf(first.data.body.blockedURL),
      disposition: dispositionOf(first.data.body.disposition),
    };
  }
  return null;
}

export async function POST(request: Request): Promise<NextResponse> {
  const headers = noStoreHeaders();
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_BODY_BYTES) return new NextResponse(null, { status: 204, headers });

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return new NextResponse(null, { status: 204, headers });
  }
  if (rawBody.length > MAX_BODY_BYTES || rawBody.length === 0) {
    return new NextResponse(null, { status: 204, headers });
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return new NextResponse(null, { status: 204, headers });
  }

  const sanitized = sanitize(body);
  if (!sanitized) return new NextResponse(null, { status: 204, headers });

  // T0.4.8 metric: bounded sampled structured log — counts only, the raw
  // payload (and any credential it might carry) is never logged.
  if (shouldLogCspViolation(Date.now())) {
    console.log(
      JSON.stringify({
        event: "csp.violation",
        effectiveDirective: sanitized.effectiveDirective,
        blockedHost: sanitized.blockedHost,
        disposition: sanitized.disposition,
        ...(sanitized.statusCode !== undefined ? { statusCode: sanitized.statusCode } : {}),
      }),
    );
  }
  return new NextResponse(null, { status: 204, headers });
}
