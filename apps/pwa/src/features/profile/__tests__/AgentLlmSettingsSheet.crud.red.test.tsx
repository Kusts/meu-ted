import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@/lib/test-utils";
import userEvent from "@testing-library/user-event";
import { AgentLlmSettingsSheet } from "../AgentLlmSettingsSheet";
import * as adminLlmConfig from "@/lib/api/admin-agent-llm-config";

describe("AgentLlmSettingsSheet CRUD with selectors (RED -> GREEN)", () => {
  const onCloseMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.spyOn(adminLlmConfig, "fetchAdminLlmConfig").mockResolvedValue({
      providers: [
        { id: "opencode-zen", name: "OpenCode Zen", baseUrl: "https://zen.opencode.ai/v1", secretAlias: "OPENCODE_ZEN_API_KEY", eligibility: "approved", enabled: true },
        { id: "openai-api", name: "OpenAI API", baseUrl: "https://api.openai.com/v1", secretAlias: "OPENAI_API_KEY", eligibility: "approved", enabled: true },
      ],
      models: [
        { id: "opencode-zen:zen-mini", providerId: "opencode-zen", modelId: "zen-mini", protocol: "chat-completions", privacyClass: "training_prohibited", retention: null, enabled: true },
        { id: "opencode-zen:zen-large", providerId: "opencode-zen", modelId: "zen-large", protocol: "chat-completions", privacyClass: "training_prohibited", retention: null, enabled: true },
        { id: "openai-api:gpt-4o", providerId: "openai-api", modelId: "gpt-4o", protocol: "chat-completions", privacyClass: "training_prohibited", retention: null, enabled: true },
      ],
      runtime: {
        id: 1,
        version: 2,
        activeProviderId: "opencode-zen",
        activeModelId: "zen-mini",
        activeProtocol: "chat-completions",
        activeRolloutPercentage: 100,
        securityEpoch: 1,
        updatedBy: "admin@test.com",
        updatedAt: "2026-08-27T10:00:00Z",
        fallbackProviderId: "openai-api",
        fallbackModelId: "gpt-4o",
      } as unknown as adminLlmConfig.AgentRuntimeConfig,
    });
  });

  it("renders provider selector to manage providers", async () => {
    render(<AgentLlmSettingsSheet open={true} onClose={onCloseMock} />);
    // Should have a select to choose provider for management
    expect(await screen.findByLabelText("Provedor")).toBeInTheDocument();
  });

  it("renders model selector filtered by selected provider", async () => {
    render(<AgentLlmSettingsSheet open={true} onClose={onCloseMock} />);
    await screen.findByLabelText("Provedor");
    // Model selector should exist
    expect(screen.getByLabelText("Modelo do provedor")).toBeInTheDocument();
  });

  it("renders dedicated selectors for Modelo Atual and Modelo de Fallback", async () => {
    render(<AgentLlmSettingsSheet open={true} onClose={onCloseMock} />);
    await screen.findByText(/Runtime Ativo/i);
    expect(screen.getByLabelText("Modelo Atual")).toBeInTheDocument();
    expect(screen.getByLabelText("Modelo de Fallback")).toBeInTheDocument();
  });

  it("allows registering a new provider via form", async () => {
    const user = userEvent.setup();
    const createSpy = vi.spyOn(adminLlmConfig, "createProvider").mockResolvedValue({
      provider: { id: "new-provider", name: "New", baseUrl: "https://example.com", secretAlias: "SEC", eligibility: "approved", enabled: true },
    });
    render(<AgentLlmSettingsSheet open={true} onClose={onCloseMock} />);
    await screen.findByLabelText("Provedor");
    // Try to find add provider button
    const addBtn = screen.getByRole("button", { name: /Cadastrar Provedor/i });
    await user.type(screen.getByLabelText("Novo provedor ID"), "test-provider");
    await user.click(addBtn);
    expect(createSpy).toHaveBeenCalled();
  });

  it("allows registering a new model for selected provider", async () => {
    const user = userEvent.setup();
    const createModelSpy = vi.spyOn(adminLlmConfig, "createModel").mockResolvedValue({
      model: { id: "new-model", providerId: "opencode-zen", modelId: "test-model", protocol: "chat-completions", privacyClass: "training_prohibited", retention: null, enabled: true },
    });
    render(<AgentLlmSettingsSheet open={true} onClose={onCloseMock} />);
    await screen.findByLabelText("Modelo do provedor");
    await user.type(screen.getByLabelText("Novo modelo ID"), "test-model");
    const addModelBtn = screen.getByRole("button", { name: /Cadastrar Modelo/i });
    await user.click(addModelBtn);
    expect(createModelSpy).toHaveBeenCalled();
  });
});
