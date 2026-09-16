import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import { POST } from "./route";
import {
  CSP_REPORT_LOG_BUDGET_PER_MINUTE,
  __resetCspReportBudgetForTests,
} from "./sampling";

function consoleSpy() {
  return vi.spyOn(console, "log").mockImplementation(() => undefined);
}

beforeEach(() => {
  __resetCspReportBudgetForTests();
});

afterEach(() => {
  vi.restoreAllMocks();
});

const legacyPayload = {
  "csp-report": {
    "document-uri": "https://pwa.example/hub?secret=abc",
    "blocked-uri": "https://api.synkroo.com.br/health?token=xyz",
    "effective-directive": "connect-src",
    "violated-directive": "connect-src 'self' https://api.synkroo.com.br",
    disposition: "enforce",
    "status-code": 200,
  },
};

describe("POST /api/csp-report (V4 T2.7 / T0.4.8)", () => {
  it("answers 204 with no-store headers for a valid report", async () => {
    const log = consoleSpy();
    const res = await POST(
      new Request("https://pwa.example/api/csp-report", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(legacyPayload),
      }),
    );
    expect(res.status).toBe(204);
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(log).toHaveBeenCalledTimes(1);
  });

  it("logs only the blocked host, never query, path or credentials", async () => {
    const log = consoleSpy();
    await POST(
      new Request("https://pwa.example/api/csp-report", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(legacyPayload),
      }),
    );
    const logged = JSON.stringify(log.mock.calls[0]);
    expect(logged).toContain("api.synkroo.com.br");
    expect(logged).not.toContain("token=xyz");
    expect(logged).not.toContain("/health");
    expect(logged).not.toContain("secret=abc");
  });

  it("never leaks errors: invalid payloads still answer 204", async () => {
    const log = consoleSpy();
    const res = await POST(
      new Request("https://pwa.example/api/csp-report", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nonsense: true }),
      }),
    );
    expect(res.status).toBe(204);
    const logged = JSON.stringify(log.mock.calls);
    expect(logged).not.toContain("nonsense");
  });

  it("answers 204 for malformed JSON without throwing", async () => {
    consoleSpy();
    const res = await POST(
      new Request("https://pwa.example/api/csp-report", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{not-json",
      }),
    );
    expect(res.status).toBe(204);
  });

  it("samples logging: drops log lines past the per-minute budget, still 204", async () => {
    const log = consoleSpy();
    const send = () =>
      POST(
        new Request("https://pwa.example/api/csp-report", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(legacyPayload),
        }),
      );
    for (let i = 0; i < CSP_REPORT_LOG_BUDGET_PER_MINUTE + 3; i += 1) {
      const res = await send();
      expect(res.status).toBe(204);
    }
    expect(log).toHaveBeenCalledTimes(CSP_REPORT_LOG_BUDGET_PER_MINUTE);
  });
});
