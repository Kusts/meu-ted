import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as React from "react";
import { renderHook, render, waitFor } from "@testing-library/react";
import { UnsavedChangesProvider } from "@/lib/unsaved-changes";
import {
  useSWCoordinator,
  SWCoordinator,
  activateWaitingIfClean,
} from "./sw-coordinator";

function installMocks(enabled: boolean | undefined) {
  const regs = [{ unregister: vi.fn().mockResolvedValue(true) }];
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ json: vi.fn().mockResolvedValue({ enabled }) }),
  );
  // @ts-expect-error test mock
  navigator.serviceWorker = {
    getRegistrations: vi.fn().mockResolvedValue(regs),
    getRegistration: vi.fn().mockResolvedValue(undefined),
    register: vi.fn().mockResolvedValue({
      waiting: null,
      installing: null,
      active: {},
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      update: vi.fn().mockResolvedValue(undefined),
    }),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  const names = ["pi-finance-a", "other-b"];
  // @ts-expect-error test mock
  globalThis.caches = {
    keys: vi.fn().mockResolvedValue(names),
    delete: vi.fn().mockResolvedValue(true),
  };
  return { regs };
}

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <UnsavedChangesProvider>{children}</UnsavedChangesProvider>
);

describe("useSWCoordinator", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    // @ts-expect-error delete mock
    delete navigator.serviceWorker;
    // @ts-expect-error delete mock
    delete globalThis.caches;
  });
  afterEach(() => vi.unstubAllGlobals());

  it("exposes isDirty from useUnsavedChanges", () => {
    const { result } = renderHook(() => useSWCoordinator(), { wrapper });
    expect(result.current).toHaveProperty("isDirty");
    expect(result.current.isDirty).toBe(false);
  });
});

describe("activateWaitingIfClean", () => {
  it("returns false when no waiting worker", () => {
    const reg = { waiting: null } as unknown as ServiceWorkerRegistration;
    expect(activateWaitingIfClean(reg, false)).toBe(false);
  });

  it("returns false when dirty even if waiting", () => {
    const postMessage = vi.fn();
    const reg = {
      waiting: { postMessage },
    } as unknown as ServiceWorkerRegistration;
    expect(activateWaitingIfClean(reg, true)).toBe(false);
    expect(postMessage).not.toHaveBeenCalled();
  });

  it("posts CLEAN_UPDATE when clean and waiting", () => {
    const postMessage = vi.fn();
    const reg = {
      waiting: { postMessage },
    } as unknown as ServiceWorkerRegistration;
    expect(activateWaitingIfClean(reg, false)).toBe(true);
    expect(postMessage).toHaveBeenCalledWith({ type: "CLEAN_UPDATE" });
    expect(postMessage).toHaveBeenCalledWith({ action: "CLEAN_UPDATE" });
  });
});

describe("SWCoordinator", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("registers /sw.js on mount", async () => {
    installMocks(true);
    render(
      <UnsavedChangesProvider>
        <SWCoordinator>
          <div>child</div>
        </SWCoordinator>
      </UnsavedChangesProvider>,
    );
    await waitFor(() =>
      expect(navigator.serviceWorker.register).toHaveBeenCalledWith("/sw.js"),
    );
  });

  it("fetches /pwa-control with no-store", async () => {
    installMocks(true);
    render(
      <UnsavedChangesProvider>
        <SWCoordinator>
          <span>x</span>
        </SWCoordinator>
      </UnsavedChangesProvider>,
    );
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith("/pwa-control", { cache: "no-store" }),
    );
  });

  it("unregisters SW and clears only pi-finance caches when disabled", async () => {
    const { regs } = installMocks(false);
    render(
      <UnsavedChangesProvider>
        <SWCoordinator>
          <span>x</span>
        </SWCoordinator>
      </UnsavedChangesProvider>,
    );
    await waitFor(() => expect(regs[0].unregister).toHaveBeenCalled());
    await waitFor(() =>
      expect(globalThis.caches.delete).toHaveBeenCalledWith("pi-finance-a"),
    );
    expect(globalThis.caches.delete).not.toHaveBeenCalledWith("other-b");
  });

  it("ignores fetch errors without throwing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    // @ts-expect-error mock
    navigator.serviceWorker = {
      register: vi.fn().mockRejectedValue(new Error("no sw")),
      getRegistrations: vi.fn().mockResolvedValue([]),
      getRegistration: vi.fn().mockResolvedValue(undefined),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    expect(() =>
      render(
        <UnsavedChangesProvider>
          <SWCoordinator>
            <span>x</span>
          </SWCoordinator>
        </UnsavedChangesProvider>,
      ),
    ).not.toThrow();
    await new Promise((r) => setTimeout(r, 30));
  });
});
