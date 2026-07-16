import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";

function makeReq(payload: unknown): NextRequest {
  return new NextRequest("http://localhost/api/observability/rum", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

describe("RUM POST route (/api/observability/rum)", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });
  afterEach(() => {
    logSpy.mockRestore();
  });

  it("accepts a valid sanitized event with 204 and no-store headers", async () => {
    const res = await POST(
      makeReq({ metric: "LCP", value: 1234, route: "/registros", buildId: "abc123" }),
    );
    expect(res.status).toBe(204);
    expect(res.headers.get("Cache-Control")).toContain("no-store");
    expect(res.headers.get("CDN-Cache-Control")).toBe("no-store");
  });

  it("rejects a disallowed/sensitive field with 400", async () => {
    const res = await POST(
      makeReq({ metric: "LCP", value: 1, route: "/", token: "leaked-token-123" }),
    );
    expect(res.status).toBe(400);
  });

  it("rejects a non-numeric value with 400", async () => {
    const res = await POST(makeReq({ metric: "LCP", value: "abc", route: "/" }));
    expect(res.status).toBe(400);
  });

  it("rejects an unknown metric with 400", async () => {
    const res = await POST(makeReq({ metric: "SECRET", value: 1, route: "/" }));
    expect(res.status).toBe(400);
  });

  it("rejects a sensitive route with 400", async () => {
    const res = await POST(makeReq({ metric: "LCP", value: 1, route: "/api/secrets" }));
    expect(res.status).toBe(400);
  });

  it("rejects malformed JSON with 400", async () => {
    const req = new NextRequest("http://localhost/api/observability/rum", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{ not json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("never logs the sensitive payload", async () => {
    await POST(
      makeReq({ metric: "LCP", value: 1, route: "/", token: "leaked-token-123" }),
    );
    const allArgs = logSpy.mock.calls.map((c) => c.join(" ")).join(" ");
    expect(allArgs).not.toContain("leaked-token-123");
    expect(allArgs).not.toContain("token");
  });

  it("logs only non-sensitive aggregate (metric + route), never the value", async () => {
    await POST(makeReq({ metric: "LCP", value: 1234, route: "/registros" }));
    const aggregatedCall = logSpy.mock.calls.find((c) => c[0] === "[rum] aggregated");
    expect(aggregatedCall).toBeDefined();
    const payload = aggregatedCall?.[1] as { metric?: string; route?: string; value?: unknown };
    expect(payload.metric).toBe("LCP");
    expect(payload.route).toBe("/registros");
    expect(payload).not.toHaveProperty("value");
    const allArgs = logSpy.mock.calls.map((c) => c.join(" ")).join(" ");
    expect(allArgs).not.toContain("1234");
  });
});
