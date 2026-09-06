import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@/lib/test-utils";
import userEvent from "@testing-library/user-event";
import { AgentLlmSettingsSheet } from "../AgentLlmSettingsSheet";
import * as adminLlmConfig from "@/lib/api/admin-agent-llm-config";

describe("AgentLlmSettingsSheet Component (Task 11)", () => {
  const onCloseMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    vi.spyOn(adminLlmConfig, "fetchAdminLlmConfig").mockResolvedValue({
      providers: [
        {
          id: "opencode-zen",
          name: "OpenCode Zen",
          baseUrl: "https://zen.opencode.ai/v1",
          secretAlias: "OPENCODE_ZEN_API_KEY",
          eligibility: "approved",
          enabled: true,
        },
      ],
      models: [
        {
          id: "gpt-4o",
          providerId: "opencode-zen",
          modelId: "gpt-4o",
          protocol: "chat-completions",
          privacyClass: "training_prohibited",
          retention: null,
          enabled: true,
        },
      ],
      runtime: {
        id: 1,
        version: 1,
        activeProviderId: "opencode-zen",
        activeModelId: "gpt-4o",
        activeProtocol: "chat-completions",
        activeRolloutPercentage: 100,
        securityEpoch: 1,
        updatedBy: "admin@test.com",
        updatedAt: "2026-08-27T10:00:00Z",
      },
    });
  });

  it("renders active config, providers, and models", async () => {
    render(<AgentLlmSettingsSheet open={true} onClose={onCloseMock} />);

    expect(await screen.findByText(/Runtime Ativo/i)).toBeInTheDocument();
    expect(screen.getByText(/v1/)).toBeInTheDocument();
    expect(screen.getAllByText("OpenCode Zen").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("OPENCODE_ZEN_API_KEY").length).toBeGreaterThanOrEqual(1);
    expect(await screen.findAllByText("gpt-4o")).not.toHaveLength(0);
  });

  it("toggles provider status when clicked", async () => {
    const user = userEvent.setup();
    const toggleSpy = vi.spyOn(adminLlmConfig, "toggleProvider").mockResolvedValue({
      provider: {
        id: "opencode-zen",
        name: "OpenCode Zen",
        baseUrl: "https://zen.opencode.ai/v1",
        secretAlias: "OPENCODE_ZEN_API_KEY",
        eligibility: "approved",
        enabled: false,
      },
    });

    render(<AgentLlmSettingsSheet open={true} onClose={onCloseMock} />);

    const button = await screen.findByRole("button", { name: "Ativo" });
    await user.click(button);

    expect(toggleSpy).toHaveBeenCalledWith("opencode-zen", false);
  });
});
