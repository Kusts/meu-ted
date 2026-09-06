/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@/lib/test-utils";
import { AgentLlmSettingsSheet } from "../AgentLlmSettingsSheet";
import * as adminLlmConfig from "@/lib/api/admin-agent-llm-config";

/**
 * Contract guard (Fase 1a): the sheet renders a REAL mapper-shaped runtime DTO
 * (active* names only, no legacy providerId/modelId) as the active runtime.
 * This is the B-C2 scenario turned into a regression test.
 */
describe("AgentLlmSettingsSheet runtime contract (Fase 1a)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders Runtime Ativo from a mapper-shaped DTO without legacy fields", async () => {
    vi.spyOn(adminLlmConfig, "fetchAdminLlmConfig").mockResolvedValue({
      providers: [
        { id: "openai-api", name: "OpenAI API", kind: "openai-api", transport: "direct", authMode: "api-key", secretAlias: "OPENAI_API_KEY", eligibility: "approved", enabled: true },
      ],
      models: [
        { id: "openai-api:gpt-4o", providerId: "openai-api", modelId: "gpt-4o", protocol: "chat-completions", privacyClass: "training_prohibited", retention: null, enabled: true },
      ],
      runtime: {
        singleton: "active",
        version: 4,
        securityEpoch: 2,
        activeProviderId: "openai-api",
        activeModelId: "openai-api:gpt-4o",
        activeProtocol: "chat-completions",
        activeRolloutPercentage: 100,
        activeRolloutMode: "all",
        canaryAllowlist: [],
        fallbackProviderId: null,
        fallbackModelId: null,
        updatedBy: "admin@test.com",
        updatedAt: new Date().toISOString(),
      } as any,
    });

    render(<AgentLlmSettingsSheet open={true} onClose={vi.fn()} />);
    expect(await screen.findByText(/Runtime Ativo/i)).toBeInTheDocument();
    expect((await screen.findAllByText("openai-api")).length).toBeGreaterThanOrEqual(1);
    expect(await screen.findByText("openai-api:gpt-4o")).toBeInTheDocument();
    expect(screen.queryByText("— Nenhum")).not.toBeInTheDocument();
  });
});
