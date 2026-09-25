import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { StaleBanner } from "../StaleBanner";
import * as ctx from "@/lib/state/app-state-context";

beforeEach(() => vi.restoreAllMocks());

function stub(
  accountsSource: "live" | "snapshot" | "unavailable",
  overrides: { refreshDomains?: unknown } = {},
) {
  const refreshDomains =
    "refreshDomains" in overrides
      ? (overrides.refreshDomains as ctx.AppState["refreshDomains"])
      : vi.fn().mockResolvedValue(true);
  vi.spyOn(ctx, "useAppState").mockReturnValue({
    readOnly: accountsSource !== "live",
    refreshDomains,
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
  return { refreshDomains: refreshDomains as ReturnType<typeof vi.fn> };
}

function stubReload() {
  const reloadSpy = vi.fn();
  Object.defineProperty(window, "location", {
    value: { ...window.location, reload: reloadSpy },
    writable: true,
    configurable: true,
  });
  return reloadSpy;
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

    it("falls back to window.location.reload when refreshDomains is unavailable", async () => {
      stub("unavailable", { refreshDomains: undefined });
      // Stub reload to avoid jsdom navigation
      const reloadSpy = stubReload();
      render(<StaleBanner domains={["accounts"]} />);
      fireEvent.click(
        screen.getByRole("button", { name: /tentar novamente/i }),
      );
      await waitFor(() => expect(reloadSpy).toHaveBeenCalledTimes(1));
    });

    it("retries via refreshDomains for the banner domains instead of reloading", async () => {
      const { refreshDomains } = stub("unavailable");
      const reloadSpy = stubReload();
      render(<StaleBanner domains={["accounts"]} />);
      fireEvent.click(
        screen.getByRole("button", { name: /tentar novamente/i }),
      );
      await waitFor(() =>
        expect(refreshDomains).toHaveBeenCalledWith(["accounts"]),
      );
      expect(reloadSpy).not.toHaveBeenCalled();
    });

    it("falls back to reload when the domain refresh rejects", async () => {
      const { refreshDomains } = stub("unavailable");
      refreshDomains.mockRejectedValueOnce(new Error("offline"));
      const reloadSpy = stubReload();
      render(<StaleBanner domains={["accounts"]} />);
      fireEvent.click(
        screen.getByRole("button", { name: /tentar novamente/i }),
      );
      await waitFor(() => expect(reloadSpy).toHaveBeenCalledTimes(1));
      expect(refreshDomains).toHaveBeenCalledWith(["accounts"]);
    });

    it("falls back to reload when the domain refresh reports no live data", async () => {
      const { refreshDomains } = stub("unavailable");
      refreshDomains.mockResolvedValueOnce(false);
      const reloadSpy = stubReload();
      render(<StaleBanner domains={["accounts"]} />);
      fireEvent.click(
        screen.getByRole("button", { name: /tentar novamente/i }),
      );
      await waitFor(() => expect(reloadSpy).toHaveBeenCalledTimes(1));
      expect(refreshDomains).toHaveBeenCalledWith(["accounts"]);
    });
  });

  describe("snapshot retry CTA (item 7: refresh por domínio, sem reload)", () => {
    it("renders a 'Tentar novamente' button on the snapshot banner", () => {
      stub("snapshot");
      render(<StaleBanner domains={["accounts"]} />);
      expect(
        screen.getByRole("button", { name: /tentar novamente/i }),
      ).toBeInTheDocument();
    });

    it("retries via refreshDomains scoped to the snapshotted domains without reloading", async () => {
      const { refreshDomains } = stub("snapshot");
      const reloadSpy = stubReload();
      render(<StaleBanner domains={["accounts"]} />);
      fireEvent.click(
        screen.getByRole("button", { name: /tentar novamente/i }),
      );
      await waitFor(() =>
        expect(refreshDomains).toHaveBeenCalledWith(["accounts"]),
      );
      expect(reloadSpy).not.toHaveBeenCalled();
    });

    it("ignores legacy onRetry in snapshot and refreshes snapshotted domains", async () => {
      const { refreshDomains } = stub("snapshot");
      const reloadSpy = stubReload();
      const onRetry = vi.fn();
      render(<StaleBanner domains={["accounts"]} onRetry={onRetry} />);
      fireEvent.click(
        screen.getByRole("button", { name: /tentar novamente/i }),
      );
      await waitFor(() =>
        expect(refreshDomains).toHaveBeenCalledWith(["accounts"]),
      );
      expect(onRetry).not.toHaveBeenCalled();
      expect(reloadSpy).not.toHaveBeenCalled();
    });

    it("disables the retry button while refreshing (no double submit)", async () => {
      const { refreshDomains } = stub("snapshot");
      let resolveRefresh!: (v: boolean) => void;
      refreshDomains.mockImplementationOnce(
        () => new Promise<boolean>((res) => (resolveRefresh = res)),
      );
      render(<StaleBanner domains={["accounts"]} />);
      const btn = screen.getByRole("button", { name: /tentar novamente/i });
      fireEvent.click(btn);
      fireEvent.click(btn);
      expect(refreshDomains).toHaveBeenCalledTimes(1);
      expect(btn).toBeDisabled();
      resolveRefresh(true);
      await waitFor(() => expect(btn).not.toBeDisabled());
    });

    it("shows a clear accessible error without reloading when the refresh reports no live data", async () => {
      const { refreshDomains } = stub("snapshot");
      refreshDomains.mockResolvedValueOnce(false);
      const reloadSpy = stubReload();
      render(<StaleBanner domains={["accounts"]} />);
      fireEvent.click(
        screen.getByRole("button", { name: /tentar novamente/i }),
      );
      await waitFor(() =>
        expect(screen.getByRole("alert")).toBeInTheDocument(),
      );
      expect(reloadSpy).not.toHaveBeenCalled();
      // snapshot/read-only mode is preserved: banner stays, still read-only copy
      expect(screen.getByTestId("stale-banner")).toBeInTheDocument();
      expect(screen.getByText(/modo leitura/i)).toBeInTheDocument();
    });

    it("shows a clear accessible error without reloading when the refresh rejects (offline)", async () => {
      const { refreshDomains } = stub("snapshot");
      refreshDomains.mockRejectedValueOnce(new Error("offline"));
      const reloadSpy = stubReload();
      render(<StaleBanner domains={["accounts"]} />);
      fireEvent.click(
        screen.getByRole("button", { name: /tentar novamente/i }),
      );
      await waitFor(() =>
        expect(screen.getByRole("alert")).toBeInTheDocument(),
      );
      expect(reloadSpy).not.toHaveBeenCalled();
      expect(screen.getByTestId("stale-banner")).toBeInTheDocument();
    });

    it("snapshot with custom onRetry never bypasses domain refresh (explicit contract)", async () => {
      const { refreshDomains } = stub("snapshot");
      const reloadSpy = stubReload();
      const onRetry = vi.fn();
      render(<StaleBanner domains={["accounts"]} onRetry={onRetry} />);
      const retryBtn = screen.getByRole("button", {
        name: /tentar novamente/i,
      });

      // Success: owns retry via refreshDomains(snapshotted), ignores onRetry.
      refreshDomains.mockResolvedValueOnce(true);
      fireEvent.click(retryBtn);
      await waitFor(() =>
        expect(refreshDomains).toHaveBeenCalledWith(["accounts"]),
      );
      expect(onRetry).not.toHaveBeenCalled();
      expect(reloadSpy).not.toHaveBeenCalled();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();

      // False: surfaces role=alert, keeps read-only banner, still no bypass.
      refreshDomains.mockResolvedValueOnce(false);
      fireEvent.click(retryBtn);
      await waitFor(() =>
        expect(screen.getByRole("alert")).toBeInTheDocument(),
      );
      expect(onRetry).not.toHaveBeenCalled();
      expect(reloadSpy).not.toHaveBeenCalled();
      expect(screen.getByTestId("stale-banner")).toHaveAttribute(
        "data-variant",
        "snapshot",
      );

      // Reject: same fail-closed contract, onRetry still ignored.
      refreshDomains.mockRejectedValueOnce(new Error("offline"));
      fireEvent.click(retryBtn);
      await waitFor(() =>
        expect(refreshDomains).toHaveBeenCalledTimes(3),
      );
      await waitFor(() =>
        expect(screen.getByRole("alert")).toBeInTheDocument(),
      );
      expect(onRetry).not.toHaveBeenCalled();
      expect(reloadSpy).not.toHaveBeenCalled();
    });

    it("shows no error and never reloads when the refresh succeeds", async () => {
      const { refreshDomains } = stub("snapshot");
      refreshDomains.mockResolvedValueOnce(true);
      const reloadSpy = stubReload();
      render(<StaleBanner domains={["accounts"]} />);
      fireEvent.click(
        screen.getByRole("button", { name: /tentar novamente/i }),
      );
      await waitFor(() => expect(refreshDomains).toHaveBeenCalledTimes(1));
      expect(reloadSpy).not.toHaveBeenCalled();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    describe("onSnapshotRefresh post-domain hook (FIX-PWA-HOME-SNAPSHOT-SUMMARY)", () => {
      it("calls onSnapshotRefresh after domain refresh succeeds", async () => {
        const { refreshDomains } = stub("snapshot");
        refreshDomains.mockResolvedValueOnce(true);
        stubReload();
        const onSnapshotRefresh = vi.fn().mockResolvedValue(undefined);
        render(
          <StaleBanner
            domains={["accounts"]}
            onSnapshotRefresh={onSnapshotRefresh}
          />,
        );
        fireEvent.click(
          screen.getByRole("button", { name: /tentar novamente/i }),
        );
        await waitFor(() =>
          expect(refreshDomains).toHaveBeenCalledWith(["accounts"]),
        );
        await waitFor(() =>
          expect(onSnapshotRefresh).toHaveBeenCalledTimes(1),
        );
      });

      it("does NOT call onSnapshotRefresh when domain refresh reports no live data", async () => {
        const { refreshDomains } = stub("snapshot");
        refreshDomains.mockResolvedValueOnce(false);
        stubReload();
        const onSnapshotRefresh = vi.fn().mockResolvedValue(undefined);
        render(
          <StaleBanner
            domains={["accounts"]}
            onSnapshotRefresh={onSnapshotRefresh}
          />,
        );
        fireEvent.click(
          screen.getByRole("button", { name: /tentar novamente/i }),
        );
        await waitFor(() =>
          expect(screen.getByRole("alert")).toBeInTheDocument(),
        );
        expect(onSnapshotRefresh).not.toHaveBeenCalled();
      });

      it("does NOT call onSnapshotRefresh when domain refresh rejects (offline)", async () => {
        const { refreshDomains } = stub("snapshot");
        refreshDomains.mockRejectedValueOnce(new Error("offline"));
        stubReload();
        const onSnapshotRefresh = vi.fn().mockResolvedValue(undefined);
        render(
          <StaleBanner
            domains={["accounts"]}
            onSnapshotRefresh={onSnapshotRefresh}
          />,
        );
        fireEvent.click(
          screen.getByRole("button", { name: /tentar novamente/i }),
        );
        await waitFor(() =>
          expect(screen.getByRole("alert")).toBeInTheDocument(),
        );
        expect(onSnapshotRefresh).not.toHaveBeenCalled();
      });

      it("never reloads when the post-domain hook rejects (owner surfaces summary error)", async () => {
        const { refreshDomains } = stub("snapshot");
        refreshDomains.mockResolvedValueOnce(true);
        const reloadSpy = stubReload();
        const onSnapshotRefresh = vi
          .fn()
          .mockRejectedValueOnce(new Error("summary offline"));
        render(
          <StaleBanner
            domains={["accounts"]}
            onSnapshotRefresh={onSnapshotRefresh}
          />,
        );
        fireEvent.click(
          screen.getByRole("button", { name: /tentar novamente/i }),
        );
        await waitFor(() =>
          expect(onSnapshotRefresh).toHaveBeenCalledTimes(1),
        );
        expect(reloadSpy).not.toHaveBeenCalled();
      });
    });
  });
});
