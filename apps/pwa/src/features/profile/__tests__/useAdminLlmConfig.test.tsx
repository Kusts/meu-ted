/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@/lib/test-utils";
import { useAdminLlmConfig } from "../useAdminLlmConfig";
import * as adminLlmConfig from "@/lib/api/admin-agent-llm-config";
import { ApiError } from "@/lib/api/client";

const baseConfig = (overrides: any = {}) => ({
  providers: [
    { id: "openai", name: "OpenAI", kind: "openai", transport: "direct", authMode: "api-key", secretAlias: "OPENAI_API_KEY", eligibility: "approved", enabled: true },
  ],
  models: [
    { id: "openai:gpt-4o", providerId: "openai", modelId: "gpt-4o", protocol: "chat-completions", privacyClass: "training_prohibited", retention: null, enabled: true },
  ],
  runtime: {
    id: 1,
    version: 2,
    activeProviderId: "openai",
    activeModelId: "openai:gpt-4o",
    activeProtocol: "chat-completions",
    activeRolloutPercentage: 100,
    securityEpoch: 1,
    updatedBy: "admin@test.com",
    updatedAt: new Date().toISOString(),
    fallbackProviderId: null,
    fallbackModelId: null,
    ...overrides.runtime,
  },
  ...overrides,
});

describe("useAdminLlmConfig", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(adminLlmConfig, "fetchAdminLlmConfig").mockResolvedValue(baseConfig() as any);
  });

  it("loads config and exposes providers, models, runtime and default selections", async () => {
    const { result } = renderHook(() => useAdminLlmConfig());
    await act(async () => {
      await result.current.load();
    });
    expect(result.current.providers).toHaveLength(1);
    expect(result.current.models).toHaveLength(1);
    expect(result.current.runtime?.version).toBe(2);
    expect(result.current.selectedProviderId).toBe("openai");
    expect(result.current.selectedProviderModelId).toBe("openai:gpt-4o");
    expect(result.current.activeModelChoice).toBe("openai:gpt-4o");
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("aborts a superseded load and ignores its stale response", async () => {
    const signals: AbortSignal[] = [];
    let resolveFirst!: (v: any) => void;
    vi.mocked(adminLlmConfig.fetchAdminLlmConfig).mockImplementation((signal?: AbortSignal) => {
      signals.push(signal!);
      if (signals.length === 1) {
        return new Promise((resolve) => {
          resolveFirst = resolve;
        });
      }
      return Promise.resolve(baseConfig({ runtime: { version: 9 } }) as any);
    });

    const { result } = renderHook(() => useAdminLlmConfig());
    act(() => {
      void result.current.load();
    });
    await act(async () => {
      await result.current.load();
    });
    expect(signals[0]!.aborted).toBe(true);
    expect(result.current.runtime?.version).toBe(9);
    // Late first response must not clobber the fresh state.
    await act(async () => {
      resolveFirst(baseConfig({ runtime: { version: 1 } }));
    });
    expect(result.current.runtime?.version).toBe(9);
    expect(result.current.loading).toBe(false);
  });

  it("retries activate once after a 409 version conflict with the fresh version", async () => {
    const activateSpy = vi.spyOn(adminLlmConfig, "activateModel")
      .mockRejectedValueOnce(new ApiError(409, "agent.version_conflict", "Conflito de versão"))
      .mockResolvedValue({ ok: true, runtime: {} } as any);
    vi.mocked(adminLlmConfig.fetchAdminLlmConfig)
      .mockResolvedValueOnce(baseConfig() as any)
      .mockResolvedValue(baseConfig({ runtime: { version: 3 } }) as any);

    const { result } = renderHook(() => useAdminLlmConfig());
    await act(async () => {
      await result.current.load();
    });
    await act(async () => {
      await result.current.activate("openai", "gpt-4o");
    });
    expect(activateSpy).toHaveBeenCalledTimes(2);
    expect(activateSpy.mock.calls[0]![0]).toMatchObject({ expectedVersion: 2 });
    expect(activateSpy.mock.calls[1]![0]).toMatchObject({ expectedVersion: 3 });
    expect(result.current.error).toBeNull();
    expect(result.current.actionSuccess).toMatch(/ativado com sucesso/);
  });

  it("retries setFallback once after a 409 version conflict with the fresh version", async () => {
    const fallbackSpy = vi.spyOn(adminLlmConfig, "setFallbackModel")
      .mockRejectedValueOnce(new ApiError(409, "agent.version_conflict", "Conflito de versão"))
      .mockResolvedValue({ ok: true, runtime: {} } as any);
    vi.mocked(adminLlmConfig.fetchAdminLlmConfig)
      .mockResolvedValueOnce(baseConfig() as any)
      .mockResolvedValue(baseConfig({ runtime: { version: 3 } }) as any);

    const { result } = renderHook(() => useAdminLlmConfig());
    await act(async () => {
      await result.current.load();
    });
    act(() => {
      result.current.setFallbackModelChoice("openai:gpt-4o");
    });
    await act(async () => {
      await result.current.setFallback();
    });
    expect(fallbackSpy).toHaveBeenCalledTimes(2);
    expect(fallbackSpy.mock.calls[0]![0]).toMatchObject({ expectedVersion: 2 });
    expect(fallbackSpy.mock.calls[1]![0]).toMatchObject({ expectedVersion: 3 });
    expect(result.current.error).toBeNull();
    expect(result.current.actionSuccess).toMatch(/Fallback definido/);
  });

  it("surfaces partial preset failures without a success message", async () => {
    vi.mocked(adminLlmConfig.fetchAdminLlmConfig).mockResolvedValue({
      providers: [],
      models: [],
      runtime: { id: 1, version: 1, activeProviderId: null, activeModelId: null, activeProtocol: null, activeRolloutPercentage: 100, securityEpoch: 1, updatedBy: "a", updatedAt: new Date().toISOString() } as any,
    });
    vi.spyOn(adminLlmConfig, "createProvider").mockResolvedValue({ provider: {} as any });
    vi.spyOn(adminLlmConfig, "toggleProvider").mockResolvedValue({ provider: {} as any });
    vi.spyOn(adminLlmConfig, "createModel")
      .mockResolvedValueOnce({ model: {} as any })
      .mockRejectedValueOnce(new Error("model creation failed"));
    vi.spyOn(adminLlmConfig, "toggleModel").mockResolvedValue({ model: {} as any });

    const { result } = renderHook(() => useAdminLlmConfig());
    await act(async () => {
      await result.current.createPreset("openai");
    });
    expect(result.current.error).toMatch(/Preset parcial/);
    expect(result.current.actionSuccess).toBeNull();
  });

  it("tracks isMutating while a mutation is in flight", async () => {
    let resolveToggle!: (v: any) => void;
    vi.spyOn(adminLlmConfig, "toggleProvider").mockImplementation(
      () => new Promise((resolve) => { resolveToggle = resolve; }),
    );
    const { result } = renderHook(() => useAdminLlmConfig());
    await act(async () => {
      await result.current.load();
    });
    act(() => {
      void result.current.toggleProvider("openai", true);
    });
    expect(result.current.isMutating).toBe(true);
    await act(async () => {
      resolveToggle({ provider: {} });
    });
    await waitFor(() => expect(result.current.isMutating).toBe(false));
  });
});
