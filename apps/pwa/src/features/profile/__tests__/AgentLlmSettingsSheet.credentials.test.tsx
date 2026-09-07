import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@/lib/test-utils";
import userEvent from "@testing-library/user-event";
import { AgentLlmSettingsSheet } from "../AgentLlmSettingsSheet";
import * as adminLlmConfig from "@/lib/api/admin-agent-llm-config";

const config = {
  providers: [
    { id: "opencode-zen", name: "OpenCode Zen", kind: "opencode-zen", transport: "direct", authMode: "api-key", secretAlias: "OPENCODE_ZEN_API_KEY", eligibility: "approved", enabled: true },
    { id: "openai-codex-subscription", name: "Codex Subscription", kind: "openai-codex-subscription", transport: "private-broker", authMode: "chatgpt-browser", secretAlias: null, eligibility: "experimental_blocked", enabled: false },
  ],
  models: [
    { id: "opencode-zen:zen-1", providerId: "opencode-zen", modelId: "zen-1", protocol: "chat-completions", privacyClass: "training_prohibited", retention: null, enabled: true },
  ],
  runtime: {
    singleton: "active",
    version: 2,
    securityEpoch: 1,
    activeProviderId: "opencode-zen",
    activeModelId: "opencode-zen:zen-1",
    activeProtocol: "chat-completions",
    activeRolloutPercentage: 100,
    activeRolloutMode: "disabled",
    canaryAllowlist: [],
    fallbackProviderId: null,
    fallbackModelId: null,
    updatedBy: "admin@test.com",
    updatedAt: new Date().toISOString(),
  },
};

describe("AgentLlmSettingsSheet credentials (Gerenciador de IA)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(adminLlmConfig, "fetchAdminLlmConfig").mockResolvedValue(config as never);
    vi.spyOn(adminLlmConfig, "fetchProviderCredential").mockImplementation(async (providerId: string) => ({
      credential: {
        providerId,
        configured: providerId === "opencode-zen",
        masked: providerId === "opencode-zen" ? "sk-…abcd" : null,
        updatedAt: null,
      },
    }));
    vi.spyOn(adminLlmConfig, "fetchRemoteModels").mockResolvedValue({
      providerId: "opencode-zen",
      models: [],
      cached: false,
      manualEntryAllowed: true,
    });
  });

  it("exibe título Gerenciador de IA e status ATIVO / não configurado por provider", async () => {
    render(<AgentLlmSettingsSheet open={true} onClose={vi.fn()} />);
    expect(await screen.findByText("Gerenciador de IA · Meu Ted")).toBeInTheDocument();
    expect(await screen.findByText("ATIVO")).toBeInTheDocument();
    expect(await screen.findByText("não configurado")).toBeInTheDocument();
    expect(await screen.findByText("sk-…abcd")).toBeInTheDocument();
  });

  it("salva a chave sem jamais exibir o valor integral", async () => {
    const user = userEvent.setup();
    const saveSpy = vi.spyOn(adminLlmConfig, "saveProviderCredential").mockResolvedValue({
      credential: { providerId: "opencode-zen", configured: true, masked: "sk-…wxyz", updatedAt: "now" },
    });
    render(<AgentLlmSettingsSheet open={true} onClose={vi.fn()} />);
    const input = await screen.findByLabelText("API key de opencode-zen");
    await user.type(input, "sk-live-secret-value-wxyz");
    await user.click(screen.getByRole("button", { name: /Salvar chave/ }));
    await waitFor(() => expect(saveSpy).toHaveBeenCalledWith("opencode-zen", "sk-live-secret-value-wxyz"));
    // Input limpo e valor integral nunca renderizado.
    await waitFor(() => expect(input).toHaveValue(""));
    expect(screen.queryByText("sk-live-secret-value-wxyz")).not.toBeInTheDocument();
    expect(await screen.findByText("sk-…wxyz")).toBeInTheDocument();
  });

  it("codex exibe sessão via browser em vez de campo de chave", async () => {
    render(<AgentLlmSettingsSheet open={true} onClose={vi.fn()} />);
    expect(await screen.findByText(/Sessão via browser \(plano Coding\)/)).toBeInTheDocument();
    expect(screen.queryByLabelText("API key de openai-codex-subscription")).not.toBeInTheDocument();
  });

  it("lista modelos remotos e cadastra no clique", async () => {
    const user = userEvent.setup();
    vi.mocked(adminLlmConfig.fetchRemoteModels).mockResolvedValue({
      providerId: "opencode-zen",
      models: [{ id: "zen-2" }],
      cached: false,
      manualEntryAllowed: true,
    });
    const createSpy = vi.spyOn(adminLlmConfig, "createModel").mockResolvedValue({ model: {} as never });
    render(<AgentLlmSettingsSheet open={true} onClose={vi.fn()} />);
    await screen.findByText("Gerenciador de IA · Meu Ted");
    await user.click(screen.getByRole("button", { name: /Atualizar lista/ }));
    expect(await screen.findByText("zen-2")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cadastrar modelo remoto zen-2" }));
    await waitFor(() =>
      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({ providerId: "opencode-zen", modelId: "zen-2" }),
      ),
    );
  });

  it("ativação e fallback continuam via seletores existentes", async () => {
    render(<AgentLlmSettingsSheet open={true} onClose={vi.fn()} />);
    expect(await screen.findByLabelText("Modelo Atual")).toBeInTheDocument();
    expect(await screen.findByLabelText("Modelo de Fallback")).toBeInTheDocument();
  });
});
