import { describe, it, expect, vi, afterEach } from "vitest";
import { GET } from "@/app/api/backend/[...path]/route";

afterEach(() => {
  vi.unstubAllGlobals();
});

const ctx = { params: Promise.resolve({ path: ["health"] }) };

describe("backend proxy upstream failures (P1-7)", () => {
  it("returns 504 structured JSON when upstream times out", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(
        new DOMException("The operation was aborted due to timeout", "TimeoutError"),
      ),
    );

    const res = await GET(new Request("https://pwa.test/api/backend/health"), ctx);

    expect(res.status).toBe(504);
    expect(res.headers.get("content-type")).toContain("application/json");
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("upstream_timeout");
    expect(typeof body.error.message).toBe("string");
  });

  it("returns 502 structured JSON when upstream fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("connect ECONNREFUSED 1.2.3.4:443")),
    );

    const res = await GET(new Request("https://pwa.test/api/backend/health"), ctx);

    expect(res.status).toBe(502);
    expect(res.headers.get("content-type")).toContain("application/json");
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("upstream_unavailable");
    expect(typeof body.error.message).toBe("string");
  });

  it("still proxies successful upstream responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ status: "ok" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );

    const res = await GET(new Request("https://pwa.test/api/backend/health"), ctx);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });
});
