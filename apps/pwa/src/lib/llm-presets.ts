export type LlmPresetModel = {
  modelId: string;
  protocol: "chat-completions" | "messages" | "responses" | "google-generative-ai";
  privacyClass: "training_prohibited" | "training_allowed";
  displayName: string;
};

export type LlmProviderPreset = {
  id: string;
  name: string;
  kind: string;
  secretAlias: string | null;
  transport: "direct" | "private-broker";
  authMode: "api-key" | "chatgpt-browser";
  description: string;
  autoModels: LlmPresetModel[];
};

export const LLM_PROVIDER_PRESETS: LlmProviderPreset[] = [
  {
    id: "openai",
    name: "OpenAI",
    kind: "openai",
    secretAlias: "OPENAI_API_KEY",
    transport: "direct",
    authMode: "api-key",
    description: "GPT-4o, o1, gpt-4o-mini",
    autoModels: [
      { modelId: "gpt-4o", protocol: "chat-completions", privacyClass: "training_prohibited", displayName: "GPT-4o" },
      { modelId: "gpt-4o-mini", protocol: "chat-completions", privacyClass: "training_prohibited", displayName: "GPT-4o Mini" },
      { modelId: "o1", protocol: "responses", privacyClass: "training_prohibited", displayName: "o1" },
      { modelId: "o1-mini", protocol: "responses", privacyClass: "training_prohibited", displayName: "o1 Mini" },
    ],
  },
  {
    id: "anthropic",
    name: "Claude (Anthropic)",
    kind: "anthropic",
    secretAlias: "ANTHROPIC_API_KEY",
    transport: "direct",
    authMode: "api-key",
    description: "Claude 3.5 Sonnet, Opus, Haiku",
    autoModels: [
      { modelId: "claude-3-5-sonnet-20241022", protocol: "messages", privacyClass: "training_prohibited", displayName: "Claude 3.5 Sonnet" },
      { modelId: "claude-3-opus-20240229", protocol: "messages", privacyClass: "training_prohibited", displayName: "Claude 3 Opus" },
      { modelId: "claude-3-haiku-20240307", protocol: "messages", privacyClass: "training_prohibited", displayName: "Claude 3 Haiku" },
    ],
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    kind: "deepseek",
    secretAlias: "DEEPSEEK_API_KEY",
    transport: "direct",
    authMode: "api-key",
    description: "DeepSeek Chat & Reasoner",
    autoModels: [
      { modelId: "deepseek-chat", protocol: "chat-completions", privacyClass: "training_prohibited", displayName: "DeepSeek Chat" },
      { modelId: "deepseek-reasoner", protocol: "chat-completions", privacyClass: "training_prohibited", displayName: "DeepSeek Reasoner" },
    ],
  },
  {
    id: "qwen",
    name: "Qwen (Alibaba)",
    kind: "qwen",
    secretAlias: "QWEN_API_KEY",
    transport: "direct",
    authMode: "api-key",
    description: "Qwen 2.5, Qwen Max",
    autoModels: [
      { modelId: "qwen2.5-72b-instruct", protocol: "chat-completions", privacyClass: "training_prohibited", displayName: "Qwen 2.5 72B" },
      { modelId: "qwen-max", protocol: "chat-completions", privacyClass: "training_prohibited", displayName: "Qwen Max" },
    ],
  },
  {
    id: "glm",
    name: "GLM (Zhipu)",
    kind: "glm",
    secretAlias: "GLM_API_KEY",
    transport: "direct",
    authMode: "api-key",
    description: "GLM-4, GLM-4 Plus",
    autoModels: [
      { modelId: "glm-4", protocol: "chat-completions", privacyClass: "training_prohibited", displayName: "GLM-4" },
      { modelId: "glm-4-plus", protocol: "chat-completions", privacyClass: "training_prohibited", displayName: "GLM-4 Plus" },
    ],
  },
  {
    id: "minimax",
    name: "MiniMax",
    kind: "minimax",
    secretAlias: "MINIMAX_API_KEY",
    transport: "direct",
    authMode: "api-key",
    description: "MiniMax Text 01, ABAB",
    autoModels: [
      { modelId: "minimax-text-01", protocol: "chat-completions", privacyClass: "training_prohibited", displayName: "MiniMax Text 01" },
      { modelId: "abab6.5-chat", protocol: "chat-completions", privacyClass: "training_prohibited", displayName: "ABAB 6.5" },
    ],
  },
  {
    id: "opencode-zen",
    name: "OpenCode Zen",
    kind: "opencode-zen",
    secretAlias: "OPENCODE_ZEN_API_KEY",
    transport: "direct",
    authMode: "api-key",
    description: "Zen - OpenCode",
    autoModels: [
      { modelId: "zen-1", protocol: "chat-completions", privacyClass: "training_prohibited", displayName: "Zen 1" },
    ],
  },
  {
    id: "opencode-go",
    name: "OpenCode Go",
    kind: "opencode-go",
    secretAlias: "OPENCODE_GO_API_KEY",
    transport: "direct",
    authMode: "api-key",
    description: "Go - OpenCode",
    autoModels: [
      { modelId: "go-1", protocol: "chat-completions", privacyClass: "training_prohibited", displayName: "Go 1" },
    ],
  },
  {
    id: "openai-codex-subscription",
    name: "Codex Subscription",
    kind: "openai-codex-subscription",
    secretAlias: null,
    transport: "private-broker",
    authMode: "chatgpt-browser",
    description: "ChatGPT Codex via broker",
    autoModels: [
      { modelId: "codex-mini", protocol: "responses", privacyClass: "training_prohibited", displayName: "Codex Mini" },
    ],
  },
];

export function getLlmPreset(id: string): LlmProviderPreset | undefined {
  return LLM_PROVIDER_PRESETS.find((p) => p.id === id || p.kind === id);
}

export function getLlmPresetBySecretAlias(alias: string): LlmProviderPreset | undefined {
  return LLM_PROVIDER_PRESETS.find((p) => p.secretAlias === alias);
}
