import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { StaleBanner } from "../StaleBanner";
import * as ctx from "@/lib/state/app-state-context";

beforeEach(() => vi.restoreAllMocks());

function stub(accountsSource: "live" | "snapshot" | "unavailable") {
  vi.spyOn(ctx, "useAppState").mockReturnValue({
    readOnly: accountsSource !== "live",
    sync: {
      accounts: {
        source: accountsSource,
        syncedAt: "2026-06-20T10:00:00.000Z",
      },
      categories: { source: "live", syncedAt: null },
      transactions: { source: "live", syncedAt: null },
      payables: { source: "live", syncedAt: null },
      budgets: { source: "live", syncedAt: null },
      goals: { source: "live", syncedAt: null },
      subscriptions: { source: "live", syncedAt: null },
      cardStatements: { source: "live", syncedAt: null },
    },
  } as unknown as ctx.AppState);
}

describe("StaleBanner", () => {
  it("renders nothing when the watched domains are all live", () => {
    stub("live");
    const { container } = render(<StaleBanner domains={["accounts"]} />);
    expect(container.innerHTML).toBe("");
  });

  it("renders a stale read-only warning when a watched domain is snapshot", () => {
    stub("snapshot");
    render(<StaleBanner domains={["accounts"]} />);
    expect(screen.getByText(/desatualizados/i)).toBeInTheDocument();
  });

  it("renders a backend-unavailable warning when a watched domain is unavailable", () => {
    stub("unavailable");
    render(<StaleBanner domains={["accounts"]} />);
    expect(
      screen.getByText(/não foi possível carregar|indisponível/i),
    ).toBeInTheDocument();
  });

  it("ignores domains the screen does not watch", () => {
    stub("snapshot"); // accounts is snapshot, but we only watch goals
    const { container } = render(<StaleBanner domains={["goals"]} />);
    expect(container.innerHTML).toBe("");
  });
});
