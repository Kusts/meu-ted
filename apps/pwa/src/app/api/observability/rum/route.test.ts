import { describe, it, expect, vi, afterEach } from "vitest";
import { POST, RUM_RATE_LIMIT, RUM_MAX_BODY_BYTES } from "./route";

const VALID = { metric: "LCP", value: 1200, route: "/" };

function post(
  body: unknown,
  opts: { origin?: string | null; site?: string; ip?: string } = {},
): Promise<Response> {
  const headers = new Headers({ "content-type": "application/json" });
  if (opts.origin !== null) headers.set("origin", opts.origin ?? "http://localhost:3000");
  if (opts.site !== undefined) headers.set("sec-fetch-site", opts.site);
  if (opts.ip !== undefined) headers.set("x-forwarded-for", opts.ip);
  const raw = typeof body === "string" ? body : JSON.stringify(body);
  return POST(
    new Request("http://localhost:3000/api/observability/rum", {
      method: "POST",
      headers,
      body: raw,
    }) as unknown as Parameters<typeof POST>[0],
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/observability/rum hardening (P2-10)", () => {
  it("returns 403 for cross-origin origins", async () => {
    const res = await post(VALID, { origin: "https://evil.example", ip: "p2-10-cross" });
    expect(res.status).toBe(403);
  });

  it("returns 403 when Sec-Fetch-Site declares cross-site", async () => {
    const res = await post(VALID, { site: "cross-site", ip: "p2-10-crosssite" });
    expect(res.status).toBe(403);
  });

  it("returns 403 when Origin is absent (same-origin must be verifiable)", async () => {
    const res = await post(VALID, { origin: null, ip: "p2-10-noorigin" });
    expect(res.status).toBe(403);
  });

  it("returns 204 for same-origin valid payloads", async () => {
    const res = await post(VALID, { ip: "p2-10-valid" });
    expect(res.status).toBe(204);
  });

  it("returns 413 for an oversized body", async () => {
    const oversized = JSON.stringify({
      ...VALID,
      buildId: "a".repeat(RUM_MAX_BODY_BYTES + 100),
    });
    const res = await post(oversized, { ip: "p2-10-oversize" });
    expect(res.status).toBe(413);
  });

  it("rate-limits excessive requests from the same client", async () => {
    const ip = "p2-10-ratelimit";
    for (let i = 0; i < RUM_RATE_LIMIT.limit; i += 1) {
      const res = await post(VALID, { ip });
      expect(res.status).toBe(204);
    }
    const extra = await post(VALID, { ip });
    expect(extra.status).toBe(429);
  });

  it("does not log raw payload contents", async () => {
    const logSpy = vi.spyOn(console, "log");
    const marker = "SUPER_SECRET_TOKEN_MARKER";

    await post({ ...VALID, buildId: marker }, { ip: "p2-10-log-invalid" });
    await post("x".repeat(RUM_MAX_BODY_BYTES + 50) + marker, { ip: "p2-10-log-oversize" });

    const logged = logSpy.mock.calls.map((c) => c.map(String).join(" ")).join("\n");
    expect(logged).not.toContain(marker);
  });
});