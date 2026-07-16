import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
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
    // new copy is softer: "Dados de …" + "modo leitura" (not "desatualizados")
    expect(screen.getByText(/modo leitura/i)).toBeInTheDocument();
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

  describe("snapshot copy", () => {
    it("uses neutral/info tone, not danger, when serving cached data", () => {
      stub("snapshot");
      const { container } = render(<StaleBanner domains={["accounts"]} />);
      // snapshot should NOT use danger tint class
      const banner = container.firstElementChild as HTMLElement;
      expect(banner.className).not.toMatch(/bg-danger-tint/);
      expect(banner.className).not.toMatch(/text-danger/);
    });

    it("shows the last sync timestamp when known", () => {
      stub("snapshot");
      render(<StaleBanner domains={["accounts"]} />);
      // Should show "Dados de …" with formatted date+time
      expect(screen.getByText(/dados de .*— modo leitura/i)).toBeInTheDocument();
    });

    it("communicates read-only mode clearly", () => {
      stub("snapshot");
      render(<StaleBanner domains={["accounts"]} />);
      expect(screen.getByText(/modo (somente )?leitura/i)).toBeInTheDocument();
    });
  });

  describe("snapshot dismiss CTA", () => {
    it("renders a dismiss button on snapshot banner when onDismiss is provided", () => {
      stub("snapshot");
      render(
        <StaleBanner domains={["accounts"]} onDismiss={vi.fn()} />,
      );
      expect(
        screen.getByRole("button", { name: /dispensar/i }),
      ).toBeInTheDocument();
    });

    it("does not render a dismiss button when onDismiss is not provided", () => {
      stub("snapshot");
      render(<StaleBanner domains={["accounts"]} />);
      expect(
        screen.queryByRole("button", { name: /dispensar/i }),
      ).not.toBeInTheDocument();
    });

    it("calls onDismiss when dismiss button is clicked", () => {
      stub("snapshot");
      const onDismiss = vi.fn();
      render(
        <StaleBanner domains={["accounts"]} onDismiss={onDismiss} />,
      );
      fireEvent.click(
        screen.getByRole("button", { name: /fechar|dispensar/i }),
      );
      expect(onDismiss).toHaveBeenCalledTimes(1);
    });
  });

  describe("unavailable retry CTA", () => {
    it("renders a 'Tentar novamente' button on unavailable banner", () => {
      stub("unavailable");
      render(<StaleBanner domains={["accounts"]} onRetry={vi.fn()} />);
      expect(
        screen.getByRole("button", { name: /tentar novamente/i }),
      ).toBeInTheDocument();
    });

    it("calls onRetry when retry button is clicked", () => {
      stub("unavailable");
      const onRetry = vi.fn();
      render(<StaleBanner domains={["accounts"]} onRetry={onRetry} />);
      fireEvent.click(
        screen.getByRole("button", { name: /tentar novamente/i }),
      );
      expect(onRetry).toHaveBeenCalledTimes(1);
    });

    it("falls back to default retry behavior (window.location.reload) when no onRetry prop", () => {
      stub("unavailable");
      // Stub reload to avoid jsdom navigation
      const reloadSpy = vi.fn();
      Object.defineProperty(window, "location", {
        value: { ...window.location, reload: reloadSpy },
        writable: true,
        configurable: true,
      });
      render(<StaleBanner domains={["accounts"]} />);
      fireEvent.click(
        screen.getByRole("button", { name: /tentar novamente/i }),
      );
      expect(reloadSpy).toHaveBeenCalledTimes(1);
    });
  });
});