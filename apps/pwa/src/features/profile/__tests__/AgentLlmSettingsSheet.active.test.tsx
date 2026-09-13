import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@/lib/test-utils";
import { AgentLlmSettingsSheet } from "../AgentLlmSettingsSheet";
import * as adminLlmConfig from "@/lib/api/admin-agent-llm-config";

/**
 * Regressão para seletor LLM: exatamente um badge Ativo corresponde ao identificador canônico da API
 * - Backend armazena runtime.activeModelId como models.id (provider:modelId)
 * - UI compara com m.id (canônico) e desabilita/rotula o modelo ativo
 */
describe("AgentLlmSettingsSheet active badge (regressão)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("mostra exatamente um Ativo e 2 Ativar Global quando 3 modelos e um é o runtime canônico (id)", async () => {
    vi.spyOn(adminLlmConfig, "fetchAdminLlmConfig").mockResolvedValue({
      providers: [
        { id: "opencode-zen", name: "OpenCode Zen", baseUrl: "https://zen...", secretAlias: "OPENCODE_ZEN_API_KEY", eligibility: "approved", enabled: true, kind: "opencode-zen", transport: "direct", authMode: "api-key" },
        { id: "openai-api", name: "OpenAI", baseUrl: "https://api.openai.com/v1", secretAlias: "OPENAI_API_KEY", eligibility: "approved", enabled: true, kind: "openai-api", transport: "direct", authMode: "api-key" },
      ],
      models: [
        { id: "opencode-zen:gpt-4.1", providerId: "opencode-zen", modelId: "gpt-4.1", protocol: "chat-completions", privacyClass: "training_prohibited", retention: null, enabled: true },
        { id: "opencode-zen:gpt-4o", providerId: "opencode-zen", modelId: "gpt-4o", protocol: "chat-completions", privacyClass: "training_prohibited", retention: null, enabled: true },
        { id: "openai-api:gpt-4o-mini", providerId: "openai-api", modelId: "gpt-4o-mini", protocol: "chat-completions", privacyClass: "training_prohibited", retention: null, enabled: true },
      ],
      runtime: {
        singleton: "active" as const,
        version: 3,
        activeProviderId: "opencode-zen",
        activeModelId: "opencode-zen:gpt-4.1",
        activeProtocol: "chat-completions",
        activeRolloutPercentage: 100,
        activeRolloutMode: "all",
        canaryAllowlist: [],
        fallbackProviderId: null,
        fallbackModelId: null,
        securityEpoch: 2,
        updatedBy: "admin@test.com",
        updatedAt: new Date().toISOString(),
      },
    });

    render(<AgentLlmSettingsSheet open={true} onClose={vi.fn()} />);
    expect(await screen.findByText(/Runtime Ativo/i)).toBeInTheDocument();
    expect(await screen.findByText("gpt-4.1")).toBeInTheDocument();
    expect(screen.getAllByText("Habilitado").length).toBe(2);
    expect(screen.getAllByText("Ativo · Habilitado").length).toBe(1);
    const ativarButtons = screen.getAllByRole("button", { name: /Ativar Global/i });
    expect(ativarButtons.length).toBe(2);
    expect(screen.getByText("Ativo · Habilitado")).toBeDisabled();
  });

  it("mostra 1 Ativar Global quando 2 modelos e um é o ativo (canônico)", async () => {
    vi.spyOn(adminLlmConfig, "fetchAdminLlmConfig").mockResolvedValue({
      providers: [{ id: "opencode-zen", name: "OpenCode Zen", baseUrl: "x", secretAlias: "OPENCODE_ZEN_API_KEY", eligibility: "approved", enabled: true, kind: "opencode-zen", transport: "direct", authMode: "api-key" }],
      models: [
        { id: "opencode-zen:model-a", providerId: "opencode-zen", modelId: "model-a", protocol: "chat-completions", privacyClass: "training_prohibited", retention: null, enabled: true },
        { id: "opencode-zen:model-b", providerId: "opencode-zen", modelId: "model-b", protocol: "chat-completions", privacyClass: "training_prohibited", retention: null, enabled: true },
      ],
      runtime: {
        singleton: "active" as const,
        version: 2,
        activeProviderId: "opencode-zen",
        activeModelId: "opencode-zen:model-a",
        activeProtocol: "chat-completions",
        activeRolloutPercentage: 100,
        activeRolloutMode: "all",
        canaryAllowlist: [],
        fallbackProviderId: null,
        fallbackModelId: null,
        securityEpoch: 1,
        updatedBy: "admin@test.com",
        updatedAt: new Date().toISOString(),
      },
    });
    render(<AgentLlmSettingsSheet open={true} onClose={vi.fn()} />);
    await screen.findByText(/Runtime Ativo/i);
    expect(await screen.findByText("model-a")).toBeInTheDocument();
    expect(screen.getAllByText("Habilitado").length).toBe(1);
    expect(screen.getByText("Ativo · Habilitado")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Ativar Global/i }).length).toBe(1);
  });

  it("compatibilidade: quando runtime usa modelId legado, ainda identifica ativo", async () => {
    vi.spyOn(adminLlmConfig, "fetchAdminLlmConfig").mockResolvedValue({
      providers: [{ id: "opencode-zen", name: "OpenCode Zen", baseUrl: "x", secretAlias: "OPENCODE_ZEN_API_KEY", eligibility: "approved", enabled: true, kind: "opencode-zen", transport: "direct", authMode: "api-key" }],
      models: [{ id: "opencode-zen:gpt-4o", providerId: "opencode-zen", modelId: "gpt-4o", protocol: "chat-completions", privacyClass: "training_prohibited", retention: null, enabled: true }],
      runtime: {
        singleton: "active" as const,
        version: 2,
        activeProviderId: "opencode-zen",
        activeModelId: "gpt-4o",
        activeProtocol: "chat-completions",
        activeRolloutPercentage: 100,
        activeRolloutMode: "all",
        canaryAllowlist: [],
        fallbackProviderId: null,
        fallbackModelId: null,
        securityEpoch: 1,
        updatedBy: "admin@test.com",
        updatedAt: new Date().toISOString(),
      },
    });
    render(<AgentLlmSettingsSheet open={true} onClose={vi.fn()} />);
    expect(await screen.findByText(/Runtime Ativo/i)).toBeInTheDocument();
    expect(await screen.findByText("Ativo · Habilitado")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Ativar Global/i })).not.toBeInTheDocument();
  });
});
