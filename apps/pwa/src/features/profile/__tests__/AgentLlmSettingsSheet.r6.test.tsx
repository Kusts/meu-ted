import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, act, waitFor } from "@/lib/test-utils";
import { AgentLlmSettingsSheet } from "../AgentLlmSettingsSheet";
import * as adminLlmConfig from "@/lib/api/admin-agent-llm-config";

import type { AdminLlmConfigResponse, LlmProvider } from "@/lib/api/admin-agent-llm-config";

const config: AdminLlmConfigResponse = {
  providers: [
    { id: "opencode-zen", name: "OpenCode Zen", kind: "opencode-zen", transport: "direct", authMode: "api-key", baseUrl: "https://zen.opencode.ai/v1", secretAlias: "OPENCODE_ZEN_API_KEY", eligibility: "approved", enabled: true },
    { id: "openai-api", name: "OpenAI API", kind: "openai-api", transport: "direct", authMode: "api-key", baseUrl: "https://api.openai.com/v1", secretAlias: "OPENAI_API_KEY", eligibility: "approved", enabled: true },
  ],
  models: [
    { id: "opencode-zen:zen-mini", providerId: "opencode-zen", modelId: "zen-mini", protocol: "chat-completions", privacyClass: "training_prohibited", retention: null, enabled: true },
    { id: "openai-api:gpt-4o", providerId: "openai-api", modelId: "gpt-4o", protocol: "chat-completions", privacyClass: "training_prohibited", retention: null, enabled: true },
  ],
  runtime: {
    singleton: "active",
    version: 2,
    securityEpoch: 1,
    activeProviderId: "opencode-zen",
    activeModelId: "zen-mini",
    activeProtocol: "chat-completions",
    activeRolloutPercentage: 100,
    activeRolloutMode: "disabled",
    canaryAllowlist: [],
    fallbackProviderId: null,
    fallbackModelId: null,
    updatedBy: "admin@test.com",
    updatedAt: "2026-08-27T10:00:00Z",
  },
};

describe("AgentLlmSettingsSheet R6 — deletes stay disabled during mutation", () => {
  const onCloseMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(adminLlmConfig, "fetchAdminLlmConfig").mockResolvedValue(config);
  });

  it("disables provider and model delete buttons while a mutation is in flight", async () => {
    let resolveToggle!: (
      v: { provider: LlmProvider } | PromiseLike<{ provider: LlmProvider }>,
    ) => void;
    vi.spyOn(adminLlmConfig, "toggleProvider").mockImplementation(
      () => new Promise((resolve) => { resolveToggle = resolve; }),
    );
    render(<AgentLlmSettingsSheet open={true} onClose={onCloseMock} />);
    const providerDelete = await screen.findByRole("button", { name: "Excluir provedor openai-api" });
    const modelDelete = await screen.findByRole("button", { name: "Excluir modelo gpt-4o" });
    expect(providerDelete).not.toBeDisabled();
    expect(modelDelete).not.toBeDisabled();

    // Start a slow mutation (provider toggle stays pending).
    const toggle = screen.getAllByRole("button", { name: "Ativo" })[0]!;
    await act(async () => {
      toggle.click();
    });
    expect(providerDelete).toBeDisabled();
    expect(modelDelete).toBeDisabled();

    await act(async () => {
      resolveToggle({ provider: config.providers[0] as LlmProvider });
    });
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Excluir provedor openai-api" }),
      ).not.toBeDisabled();
    });
    expect(
      screen.getByRole("button", { name: "Excluir modelo gpt-4o" }),
    ).not.toBeDisabled();
  });
});
