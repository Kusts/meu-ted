import { afterEach, describe, expect, it, vi } from "vitest";
import { enablePush, getPushState, type PushState } from "./push-client";

function makeRegistration() {
  return {
    pushManager: {
      getSubscription: vi.fn().mockResolvedValue(null),
      subscribe: vi.fn().mockResolvedValue({
        endpoint: "https://push.example.test/subscription-a",
        getKey: (name: string) => name === "p256dh" ? new Uint8Array([1, 2]).buffer : new Uint8Array([3, 4]).buffer,
      }),
    },
  };
}

function installPushBrowser() {
  const registration = makeRegistration();
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: {
      register: vi.fn().mockResolvedValue(registration),
      getRegistration: vi.fn().mockResolvedValue(registration),
      ready: Promise.resolve(registration),
    },
  });
  Object.defineProperty(globalThis, "Notification", {
    configurable: true,
    value: { permission: "default", requestPermission: vi.fn().mockResolvedValue("granted") },
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: undefined });
  Object.defineProperty(navigator, "userAgent", { configurable: true, value: "Mozilla/5.0" });
});

describe("PWA Web Push client", () => {
  it("reports unsupported when the browser has no Push API", async () => {
    const state: PushState = await getPushState();
    expect(state).toBe("unsupported");
  });

  it("requires standalone installation before offering push on iOS", async () => {
    installPushBrowser();
    Object.defineProperty(navigator, "userAgent", { configurable: true, value: "Mozilla/5.0 (iPhone)" });
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: false }));
    await expect(getPushState()).resolves.toBe("install-required");

    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: true }));
    await expect(getPushState()).resolves.toBe("ready");
  });

  it("invokes the permission prompt synchronously from the activation path", async () => {
    installPushBrowser();
    vi.stubEnv("NEXT_PUBLIC_PI_FINANCE_API_BASE_URL", "https://api.example.test");
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ publicKey: "BPublicKey" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "subscription-1", endpoint: "https://push.example.test/subscription-a", active: true, updatedAt: "now" }), { status: 201 })));

    const promise = enablePush("workspace-a");
    expect(Notification.requestPermission).toHaveBeenCalledTimes(1);
    await promise;
  });

  it("requests permission only through enablePush and persists the subscription", async () => {
    installPushBrowser();
    vi.stubEnv("NEXT_PUBLIC_PI_FINANCE_API_BASE_URL", "https://api.example.test");
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ publicKey: "BPublicKey" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "subscription-1", endpoint: "https://push.example.test/subscription-a", active: true, updatedAt: "now" }), { status: 201 })));

    await expect(getPushState()).resolves.toBe("ready");
    const result = await enablePush("workspace-a");

    expect(Notification.requestPermission).toHaveBeenCalledTimes(1);
    expect(result.active).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String((fetch as ReturnType<typeof vi.fn>).mock.calls[1]?.[1]?.body))).toMatchObject({
      endpoint: "https://push.example.test/subscription-a",
      keys: { p256dh: "AQI", auth: "AwQ" },
    });
  });
});
