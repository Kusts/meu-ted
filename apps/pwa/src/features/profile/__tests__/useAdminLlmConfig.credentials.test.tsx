/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@/lib/test-utils";
import { useAdminLlmConfig } from "../useAdminLlmConfig";
import * as adminLlmConfig from "@/lib/api/admin-agent-llm-config";

const emptyConfig = {
  providers: [
    { id: "kimi", name: "Kimi", kind: "kimi", transport: "direct", authMode: "api-key", secretAlias: "KIMI_API_KEY", eligibility: "approved", enabled: true },
  ],
  models: [],
  runtime: {
    singleton: "active",
    version: 1,
    securityEpoch: 1,
    activeProviderId: null,
    activeModelId: null,
    activeProtocol: null,
    activeRolloutPercentage: 100,
    activeRolloutMode: "disabled",
    canaryAllowlist: [],
    fallbackProviderId: null,
    fallbackModelId: null,
    updatedBy: "a",
    updatedAt: new Date().toISOString(),
  },
};

describe("useAdminLlmConfig credentials", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(adminLlmConfig, "fetchAdminLlmConfig").mockResolvedValue(emptyConfig as any);
  });

  it("rejeita chave vazia sem chamada de rede", async () => {
    const saveSpy = vi.spyOn(adminLlmConfig, "saveProviderCredential");
    const { result } = renderHook(() => useAdminLlmConfig());
    let ok = true;
    await act(async () => {
      ok = await result.current.saveCredential("kimi", "   ");
    });
    expect(ok).toBe(false);
    expect(saveSpy).not.toHaveBeenCalled();
    expect(result.current.error).toMatch(/API key/);
  });

  it("salva e expõe somente o status mascarado", async () => {
    vi.spyOn(adminLlmConfig, "saveProviderCredential").mockResolvedValue({
      credential: { providerId: "kimi", configured: true, masked: "sk-…abcd", updatedAt: "now" },
    } as any);
    const { result } = renderHook(() => useAdminLlmConfig());
    let ok = false;
    await act(async () => {
      ok = await result.current.saveCredential("kimi", "sk-test-value-abcd");
    });
    expect(ok).toBe(true);
    expect(result.current.credentials["kimi"]).toMatchObject({ configured: true, masked: "sk-…abcd" });
    expect(JSON.stringify(result.current.credentials)).not.toContain("sk-test-value-abcd");
  });

  it("remove credencial e marca como não configurada", async () => {
    vi.spyOn(adminLlmConfig, "deleteProviderCredential").mockResolvedValue({
      ok: true,
      credential: { providerId: "kimi", configured: false, masked: null, updatedAt: null },
    } as any);
    const { result } = renderHook(() => useAdminLlmConfig());
    let ok = false;
    await act(async () => {
      ok = await result.current.removeCredential("kimi");
    });
    expect(ok).toBe(true);
    expect(result.current.credentials["kimi"]?.configured).toBe(false);
  });

  it("cacheia modelos remotos por 60s no cliente", async () => {
    const fetchSpy = vi.spyOn(adminLlmConfig, "fetchRemoteModels").mockResolvedValue({
      providerId: "kimi",
      models: [{ id: "kimi-k2" }],
      cached: false,
      manualEntryAllowed: true,
    } as any);
    const { result } = renderHook(() => useAdminLlmConfig());
    let first: unknown[] = [];
    await act(async () => {
      first = await result.current.loadRemoteModels("kimi");
    });
    let second: unknown[] = [];
    await act(async () => {
      second = await result.current.loadRemoteModels("kimi");
    });
    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
