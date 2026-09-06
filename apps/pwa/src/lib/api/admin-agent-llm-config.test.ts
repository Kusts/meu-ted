import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  fetchAdminLlmConfig,
  toggleProvider,
  toggleModel,
  activateModel,
} from "./admin-agent-llm-config";
import * as client from "./client";

describe("Admin Agent LLM Config API Client (Task 11)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches admin config from /admin/agent/llm-config", async () => {
    const apiFetchSpy = vi.spyOn(client, "apiFetch").mockResolvedValueOnce({
      providers: [{ id: "opencode-zen", name: "Zen", baseUrl: "https://zen.opencode.ai/v1", secretAlias: "OPENCODE_ZEN_API_KEY", eligibility: "approved", enabled: true }],
      models: [{ id: "gpt-4o", providerId: "opencode-zen", modelId: "gpt-4o", protocol: "chat-completions", privacyClass: "training_prohibited", retention: null, enabled: true }],
      runtime: { id: 1, version: 1, activeProviderId: "opencode-zen", activeModelId: "gpt-4o", activeProtocol: "chat-completions", activeRolloutPercentage: 100, securityEpoch: 1, updatedBy: "admin@test.com", updatedAt: "now" },
    });

    const data = await fetchAdminLlmConfig();
    expect(data.providers).toHaveLength(1);
    expect(data.models).toHaveLength(1);
    expect(apiFetchSpy).toHaveBeenCalledWith("/admin/agent/llm-config", {});
  });

  it("calls toggle provider and model endpoints", async () => {
    const apiFetchSpy = vi.spyOn(client, "apiFetch").mockResolvedValue({ ok: true });

    await toggleProvider("opencode-zen", true);
    expect(apiFetchSpy).toHaveBeenCalledWith("/admin/agent/llm-config/providers/opencode-zen/toggle", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled: true }),
    });

    await toggleModel("gpt-4o", false);
    expect(apiFetchSpy).toHaveBeenCalledWith("/admin/agent/llm-config/models/gpt-4o/toggle", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled: false }),
    });
  });

  it("activates global model with expected version", async () => {
    const apiFetchSpy = vi.spyOn(client, "apiFetch").mockResolvedValue({ ok: true });

    await activateModel({
      providerId: "opencode-zen",
      modelId: "gpt-4o",
      expectedVersion: 2,
      rolloutMode: "all",
    });

    expect(apiFetchSpy).toHaveBeenCalledWith("/admin/agent/llm-config/activate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        providerId: "opencode-zen",
        modelId: "gpt-4o",
        expectedVersion: 2,
        rolloutMode: "all",
      }),
    });
  });
});
