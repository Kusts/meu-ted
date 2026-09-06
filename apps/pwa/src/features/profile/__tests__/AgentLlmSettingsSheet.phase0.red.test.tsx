/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@/lib/test-utils";
import userEvent from "@testing-library/user-event";
import { AgentLlmSettingsSheet } from "../AgentLlmSettingsSheet";
import * as adminLlmConfig from "@/lib/api/admin-agent-llm-config";

describe("Phase0 PWA — RED→GREEN", () => {
  const onCloseMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(adminLlmConfig, "fetchAdminLlmConfig").mockResolvedValue({
      providers: [
        { id: "openai", name: "OpenAI", kind: "openai", transport: "direct", authMode: "api-key", secretAlias: "OPENAI_API_KEY", eligibility: "approved", enabled: true },
        { id: "anthropic", name: "Claude", kind: "anthropic", transport: "direct", authMode: "api-key", secretAlias: "ANTHROPIC_API_KEY", eligibility: "approved", enabled: true },
      ],
      models: [
        { id: "openai:gpt-4o", providerId: "openai", modelId: "gpt-4o", protocol: "chat-completions", privacyClass: "training_prohibited", retention: null, enabled: true },
        { id: "openai:gpt-4o-mini", providerId: "openai", modelId: "gpt-4o-mini", protocol: "chat-completions", privacyClass: "training_prohibited", retention: null, enabled: true },
        { id: "anthropic:claude", providerId: "anthropic", modelId: "claude", protocol: "messages", privacyClass: "training_prohibited", retention: null, enabled: true },
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
      } as any,
    });
  });

  it("7: preset com falha parcial → erro Preset parcial e sem success", async () => {
    const user = userEvent.setup();
    // createProvider succeeds, first createModel succeeds, second fails
    vi.spyOn(adminLlmConfig, "createProvider").mockResolvedValue({ provider: { id: "openai", kind: "openai", transport: "direct", authMode: "api-key", secretAlias: "OPENAI_API_KEY", eligibility: "approved", enabled: true } } as any);
    vi.spyOn(adminLlmConfig, "toggleProvider").mockResolvedValue({ provider: {} as any });
    const createModelSpy = vi.spyOn(adminLlmConfig, "createModel")
      .mockResolvedValueOnce({ model: { id: "openai:gpt-4o" } as any })
      .mockRejectedValueOnce(new Error("model creation failed for gpt-4o-mini"));
    vi.spyOn(adminLlmConfig, "toggleModel").mockResolvedValue({ model: {} as any });
    // need providers empty so preset button enabled
    vi.spyOn(adminLlmConfig, "fetchAdminLlmConfig").mockResolvedValue({
      providers: [],
      models: [],
      runtime: { id: 1, version: 1, activeProviderId: null, activeModelId: null, activeProtocol: null, activeRolloutPercentage: 100, securityEpoch: 1, updatedBy: "a", updatedAt: new Date().toISOString() } as any,
    });
    render(<AgentLlmSettingsSheet open={true} onClose={onCloseMock} />);
    await screen.findByText(/Runtime Ativo/i);
    const presetBtn = screen.getByRole("button", { name: /OpenAI/i });
    await user.click(presetBtn);
    await waitFor(() => expect(screen.getByText(/Preset parcial/i)).toBeInTheDocument(), { timeout: 2000 });
    expect(screen.queryByText(/cadastrado com 4 modelos/)).not.toBeInTheDocument();
    expect(createModelSpy).toHaveBeenCalled();
  });

  it("8: id desconhecido → erro kind inválido e zero chamadas de rede", async () => {
    const user = userEvent.setup();
    const createSpy = vi.spyOn(adminLlmConfig, "createProvider").mockResolvedValue({ provider: {} as any });
    render(<AgentLlmSettingsSheet open={true} onClose={onCloseMock} />);
    await screen.findByLabelText("Provedor");
    const input = screen.getByLabelText("Novo provedor ID");
    await user.type(input, "my-unknown-provider");
    const btn = screen.getByRole("button", { name: /Cadastrar Provedor/i });
    await user.click(btn);
    await waitFor(() => expect(screen.getByText(/kind inválido/i)).toBeInTheDocument());
    expect(createSpy).not.toHaveBeenCalled();
  });

  it("9a: delete provider limpa orphan selections", async () => {
    const user = userEvent.setup();
    vi.spyOn(adminLlmConfig, "deleteProvider").mockResolvedValue({ ok: true } as any);
    // fetch after delete returns empty to see reset
    const fetchSpy = vi.spyOn(adminLlmConfig, "fetchAdminLlmConfig")
      .mockResolvedValueOnce({
        providers: [
          { id: "openai", name: "OpenAI", kind: "openai", transport: "direct", authMode: "api-key", secretAlias: "OPENAI_API_KEY", eligibility: "approved", enabled: true },
        ],
        models: [
          { id: "openai:gpt-4o", providerId: "openai", modelId: "gpt-4o", protocol: "chat-completions", privacyClass: "training_prohibited", retention: null, enabled: true },
        ],
        runtime: { id: 1, version: 2, activeProviderId: "openai", activeModelId: "openai:gpt-4o", activeProtocol: "chat-completions", activeRolloutPercentage: 100, securityEpoch: 1, updatedBy: "a", updatedAt: new Date().toISOString(), fallbackProviderId: "openai", fallbackModelId: "openai:gpt-4o" } as any,
      })
      .mockResolvedValueOnce({
        providers: [],
        models: [],
        runtime: { id: 1, version: 3, activeProviderId: null, activeModelId: null, activeProtocol: null, activeRolloutPercentage: 100, securityEpoch: 1, updatedBy: "a", updatedAt: new Date().toISOString(), fallbackProviderId: null, fallbackModelId: null } as any,
      })
      // subsequent loads
      .mockResolvedValue({
        providers: [],
        models: [],
        runtime: { id: 1, version: 3, activeProviderId: null, activeModelId: null, activeProtocol: null, activeRolloutPercentage: 100, securityEpoch: 1, updatedBy: "a", updatedAt: new Date().toISOString() } as any,
      });

    render(<AgentLlmSettingsSheet open={true} onClose={onCloseMock} />);
    await screen.findByLabelText("Provedor");
    // wait for provider select to be populated
    await waitFor(() => expect((screen.getByLabelText("Provedor") as HTMLSelectElement).value).toBe("openai"));
    // fallback choice should be set (need to render Governance)
    await waitFor(() => expect((screen.getByLabelText("Modelo de Fallback") as HTMLSelectElement).value).toBe("openai:gpt-4o"));
    const deleteBtn = screen.getByLabelText("Excluir provedor openai");
    await user.click(deleteBtn);
    await user.click(screen.getByRole("button", { name: /^Excluir$/ }));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));
    // after delete, the selects should be reset (empty)
    await waitFor(() => {
      const prov = screen.queryByLabelText("Provedor") as HTMLSelectElement | null;
      if (prov) expect(prov.value).toBe("");
      const fb = screen.queryByLabelText("Modelo de Fallback") as HTMLSelectElement | null;
      if (fb) expect(fb.value).toBe("");
    });
  });

  it("9c: cancelar o diálogo não exclui nada", async () => {
    const user = userEvent.setup();
    const deleteSpy = vi.spyOn(adminLlmConfig, "deleteProvider").mockResolvedValue({ ok: true } as any);
    render(<AgentLlmSettingsSheet open={true} onClose={onCloseMock} />);
    await screen.findByLabelText("Provedor");
    await waitFor(() => expect((screen.getByLabelText("Provedor") as HTMLSelectElement).value).toBe("openai"));
    await user.click(screen.getByLabelText("Excluir provedor openai"));
    expect(await screen.findByText("Tem certeza que deseja excluir o provedor openai e seus modelos?")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    await waitFor(() =>
      expect(screen.queryByText("Tem certeza que deseja excluir o provedor openai e seus modelos?")).not.toBeInTheDocument(),
    );
    expect(deleteSpy).not.toHaveBeenCalled();
  });

  it("9b: trocar provider no select reseta selectedProviderModelId", async () => {
    const user = userEvent.setup();
    render(<AgentLlmSettingsSheet open={true} onClose={onCloseMock} />);
    await screen.findByLabelText("Provedor");
    await waitFor(() => expect((screen.getByLabelText("Provedor") as HTMLSelectElement).value).toBe("openai"));
    const providerSelect = screen.getByLabelText("Provedor") as HTMLSelectElement;
    const modelSelect = screen.getByLabelText("Modelo do provedor") as HTMLSelectElement;
    // Initially openai selected, model should be openai:gpt-4o
    await waitFor(() => expect(modelSelect.value).toBe("openai:gpt-4o"));
    // Change to anthropic
    await user.selectOptions(providerSelect, "anthropic");
    await waitFor(() => {
      // after change, model select should reset or show anthropic model, not stale openai model
      const mSel = screen.getByLabelText("Modelo do provedor") as HTMLSelectElement;
      expect(mSel.value).toBe("anthropic:claude");
    });
  });

  it("10: trocar select de provider NÃO dispara novo fetch", async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.mocked(adminLlmConfig.fetchAdminLlmConfig);
    fetchSpy.mockClear();
    // need to re-mock after clear to ensure initial data
    fetchSpy.mockResolvedValue({
      providers: [
        { id: "openai", name: "OpenAI", kind: "openai", transport: "direct", authMode: "api-key", secretAlias: "OPENAI_API_KEY", eligibility: "approved", enabled: true },
        { id: "anthropic", name: "Claude", kind: "anthropic", transport: "direct", authMode: "api-key", secretAlias: "ANTHROPIC_API_KEY", eligibility: "approved", enabled: true },
      ],
      models: [
        { id: "openai:gpt-4o", providerId: "openai", modelId: "gpt-4o", protocol: "chat-completions", privacyClass: "training_prohibited", retention: null, enabled: true },
        { id: "anthropic:claude", providerId: "anthropic", modelId: "claude", protocol: "messages", privacyClass: "training_prohibited", retention: null, enabled: true },
      ],
      runtime: { id: 1, version: 2, activeProviderId: "openai", activeModelId: "openai:gpt-4o", activeProtocol: "chat-completions", activeRolloutPercentage: 100, securityEpoch: 1, updatedBy: "admin@test.com", updatedAt: new Date().toISOString(), fallbackProviderId: null, fallbackModelId: null } as any,
    });
    render(<AgentLlmSettingsSheet open={true} onClose={onCloseMock} />);
    await screen.findByLabelText("Provedor");
    await waitFor(() => expect((screen.getByLabelText("Provedor") as HTMLSelectElement).value).toBe("openai"));
    const initialCalls = fetchSpy.mock.calls.length;
    expect(initialCalls).toBe(1);
    const providerSelect = screen.getByLabelText("Provedor");
    await user.selectOptions(providerSelect, "anthropic");
    // wait a bit
    await new Promise((r) => setTimeout(r, 400));
    expect(fetchSpy.mock.calls.length).toBe(1); // should NOT have refetched
  });
});
