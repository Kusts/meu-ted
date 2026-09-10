import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@/lib/test-utils";
import { useAnalytics } from "../useAnalytics";
import * as client from "@/lib/api/client";

vi.mock("@/lib/api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/client")>();
  return { ...actual, apiFetch: vi.fn() };
});

function Harness({ period }: { period: "last30days" | "lastMonth" | "thisYear" | "custom" }) {
  const bundle = useAnalytics({ period });
  return (
    <div>
      <span data-testid="loading">{String(bundle.loading)}</span>
      <span data-testid="kpis">{bundle.kpis ? String(bundle.kpis.netLiquidBalanceCents) : "none"}</span>
      <span data-testid="slices">{bundle.breakdown ? String(bundle.breakdown.slices.length) : "none"}</span>
      <span data-testid="heatmap">{bundle.heatmap ? "has" : "none"}</span>
      <button type="button" onClick={bundle.reload}>
        reload
      </button>
    </div>
  );
}

function HarnessNoHeatmap({ period }: { period: "last30days" | "lastMonth" | "thisYear" | "custom" }) {
  const bundle = useAnalytics({ period }, { includeHeatmap: false });
  return (
    <div>
      <span data-testid="loading">{String(bundle.loading)}</span>
      <span data-testid="kpis">{bundle.kpis ? String(bundle.kpis.netLiquidBalanceCents) : "none"}</span>
      <span data-testid="heatmap">{bundle.heatmap ? "has" : "none"}</span>
      <button type="button" onClick={bundle.reload}>
        reload
      </button>
    </div>
  );
}

describe("useAnalytics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(client.apiFetch).mockImplementation(async (path: string) => {
      if (path.startsWith("/analytics/kpis")) return { netLiquidBalanceCents: 12345 } as never;
      if (path.startsWith("/analytics/cashflow-series")) return { current: [], previous: [] } as never;
      if (path.startsWith("/analytics/category-breakdown"))
        return { slices: [{ categoryId: "m1" }], totalCents: 1, kind: "expense" } as never;
      if (path.startsWith("/analytics/budget-consumption")) return { items: [] } as never;
      if (path.startsWith("/analytics/daily-heatmap")) return { endDate: "2026-09-07", weeks: [] } as never;
      if (path.startsWith("/analytics/net-worth-history")) return { months: [] } as never;
      throw new Error(`unexpected path ${path}`);
    });
  });

  it("loads the bundle with period query and reloads on demand", async () => {
    render(<Harness period="lastMonth" />);
    await waitFor(() => expect(screen.getByTestId("kpis").textContent).toBe("12345"));
    expect(screen.getByTestId("slices").textContent).toBe("1");
    const calledPaths = vi.mocked(client.apiFetch).mock.calls.map((call) => String(call[0]));
    expect(calledPaths.some((p) => p.includes("period=lastMonth"))).toBe(true);
    expect(calledPaths).toHaveLength(6);
  });

  it("skips the daily-heatmap request when includeHeatmap is false", async () => {
    render(<HarnessNoHeatmap period="lastMonth" />);
    await waitFor(() => expect(screen.getByTestId("kpis").textContent).toBe("12345"));
    expect(screen.getByTestId("heatmap").textContent).toBe("none");
    const calledPaths = vi.mocked(client.apiFetch).mock.calls.map((call) => String(call[0]));
    expect(calledPaths.some((p) => p.startsWith("/analytics/daily-heatmap"))).toBe(false);
    expect(calledPaths).toHaveLength(5);
  });
});
