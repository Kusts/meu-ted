import { describe, expect, it } from "vitest";
import { LLM_PROVIDER_PRESETS, getLlmPreset } from "./llm-presets";

describe("H-08: preset OpenAI usa o ID canônico", () => {
  it("preset canônico é openai-api", () => {
    const preset = LLM_PROVIDER_PRESETS.find((p) => p.secretAlias === "OPENAI_API_KEY");
    expect(preset?.id).toBe("openai-api");
    expect(preset?.kind).toBe("openai-api");
  });

  it("alias legado ainda resolve (compatibilidade com configs salvas)", () => {
    expect(getLlmPreset("openai-api")?.id).toBe("openai-api");
    expect(getLlmPreset("openai")?.id).toBe("openai-api");
  });

  it("não há dois presets disputando a mesma secret", () => {
    const ids = LLM_PROVIDER_PRESETS.filter((p) => p.secretAlias === "OPENAI_API_KEY").map((p) => p.id);
    expect(ids).toEqual(["openai-api"]);
  });
});
