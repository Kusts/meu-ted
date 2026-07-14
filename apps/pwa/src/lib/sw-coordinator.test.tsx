// Minimal TDD tests for useSWCoordinator (was 0% covered).
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { StrictMode } from "react";
import * as React from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { UnsavedChangesProvider } from "@/lib/unsaved-changes";
import { useSWCoordinator } from "./sw-coordinator";

function installMocks(enabled: boolean | undefined) {
  const regs = [{ unregister: vi.fn().mockResolvedValue(true) }];
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ json: vi.fn().mockResolvedValue({ enabled }) }),
  );
  // @ts-expect-error test mock
  navigator.serviceWorker = { getRegistrations: vi.fn().mockResolvedValue(regs) };
  const names = ["pi-finance-a", "other-b"];
  // @ts-expect-error test mock
  globalThis.caches = {
    keys: vi.fn().mockResolvedValue(names),
    delete: vi.fn().mockResolvedValue(true),
  };
  return { regs };
}

const wrapper = ({ children }: { children: React.ReactNode }) =>
  // @ts-expect-error minimal provider wrapper
  <UnsavedChangesProvider>{children}</UnsavedChangesProvider>;

describe("useSWCoordinator", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    // Remove the properties entirely so `"x" in` checks evaluate false.
    // @ts-expect-error delete mock
    delete navigator.serviceWorker;
    // @ts-expect-error delete mock
    delete globalThis.caches;
  });
  afterEach(() => vi.unstubAllGlobals());

  it("exposes isDirty from useUnsavedChanges", () => {
    const { result } = renderHook(() => useSWCoordinator(), { wrapper });
    expect(result.current).toHaveProperty("isDirty");
  });

  it("fetches /pwa-control with no-store", async () => {
    installMocks(true);
    renderHook(() => useSWCoordinator(), { wrapper });
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith("/pwa-control", { cache: "no-store" }),
    );
  });

  it("leaves SW registered when enabled", async () => {
    const { regs } = installMocks(true);
    renderHook(() => useSWCoordinator(), { wrapper });
    await new Promise((r) => setTimeout(r, 30));
    expect(regs[0].unregister).not.toHaveBeenCalled();
  });

  it("unregisters SW and clears only pi-finance caches when disabled", async () => {
    const { regs } = installMocks(false);
    renderHook(() => useSWCoordinator(), { wrapper });
    await waitFor(() => expect(regs[0].unregister).toHaveBeenCalled());
    await waitFor(() =>
      expect(globalThis.caches.delete).toHaveBeenCalledWith("pi-finance-a"),
    );
    expect(globalThis.caches.delete).not.toHaveBeenCalledWith("other-b");
  });

  it("ignores fetch errors without throwing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    renderHook(() => useSWCoordinator(), { wrapper });
    await new Promise((r) => setTimeout(r, 30));
    expect(fetch).toHaveBeenCalled();
  });

  it("disabled with no serviceWorker/caches globals does not throw", async () => {
    // beforeEach already resets navigator.serviceWorker and globalThis.caches to undefined
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ json: vi.fn().mockResolvedValue({ enabled: false }) }),
    );
    renderHook(() => useSWCoordinator(), { wrapper });
    await new Promise((r) => setTimeout(r, 30));
    expect(fetch).toHaveBeenCalled();
  });

  it("runs boot logic once under StrictMode double-invoke (re-run guard)", async () => {
    const { regs } = installMocks(false);
    renderHook(() => useSWCoordinator(), {
      wrapper: ({ children }) => (
        // @ts-expect-error strict wrap
        <StrictMode>
          <UnsavedChangesProvider>{children}</UnsavedChangesProvider>
        </StrictMode>
      ),
    });
    await new Promise((r) => setTimeout(r, 40));
    expect(regs[0].unregister).toHaveBeenCalledTimes(1);
  });
});
