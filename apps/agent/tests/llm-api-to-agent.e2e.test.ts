import { createRequire } from "node:module";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FinanceChatAgent } from "../src/finance-chat-agent.js";
import { createInMemoryLlmConfigStore } from "../../api/src/agent/llm-config-memory.js";
import { registerInternalAgentLlmConfigRoutes } from "../../api/src/routes/internal-agent-llm-config.js";

// The Fastify constructor is resolved from the API package itself (pinned via
// createRequire anchored at an API module), never from hoisted roots — the
// agent package does not depend on fastify directly.
const apiRequire = createRequire(new URL("../../api/src/routes/index.js", import.meta.url));
const Fastify = apiRequire("fastify") as unknown as (opts?: unknown) => any;

const API_ORIGIN = "https://api.e2e.test";
const CONFIG_TOKEN = "e2e-config-token-32-chars-minimum!!";
const OPENAI_KEY = "test-openai-key";

// Minimal OpenAI Responses SSE stream, shaped against the installed
// @ai-sdk/openai chunk schema (response.created -> output_text.delta ->
// response.completed). Extracted from the provider's zod union, not guessed.
const sseChunk = (content: string): string => {
  const events = [
    {
      type: "response.created",
      response: { id: "resp-e2e", created_at: 1, model: "gpt-4o" },
    },
    {
      type: "response.output_item.added",
      output_index: 0,
      item: { type: "message", id: "msg-e2e" },
    },
    { type: "response.output_text.delta", item_id: "msg-e2e", delta: content },
    {
      type: "response.output_item.done",
      output_index: 0,
      item: { type: "message", id: "msg-e2e" },
    },
    {
      type: "response.completed",
      response: { usage: { input_tokens: 10, output_tokens: 5 } },
    },
  ];
  return `${events.map((e) => `data: ${JSON.stringify(e)}`).join("\n\n")}\n\ndata: [DONE]\n\n`;
};

type ChatResult = { text: string | Promise<string> };

const readText = (out: ChatResult): Promise<string> => Promise.resolve(out.text);

describe("E2E API -> Agent (Fase 3 item 5)", () => {
  let app: any;
  let llmStore: ReturnType<typeof createInMemoryLlmConfigStore>;
  let upstreamCalls: Array<{ url: string; init?: RequestInit }>;
  let upstreamBehavior: "ok" | "http500";
  let fetchSpy: { mockRestore: () => void };

  const seedActivePair = async () => {
    await llmStore.upsertProvider({
      id: "openai-api",
      kind: "openai-api",
      transport: "direct",
      authMode: "api-key",
      secretAlias: "OPENAI_API_KEY",
      eligibility: "approved",
    });
    await llmStore.setProviderEnabled("openai-api", true);
    const model = await llmStore.upsertModel({
      providerId: "openai-api",
      modelId: "gpt-4o",
      protocol: "chat-completions",
      privacyClass: "training_prohibited",
      enabled: true,
    });
    await llmStore.setModelEnabled(model.id, true);
    const rt = await llmStore.getRuntime();
    await llmStore.updateRuntime({
      providerId: "openai-api",
      modelId: model.id,
      expectedVersion: rt.version,
      updatedBy: "e2e@test.com",
    });
  };

  beforeEach(async () => {
    llmStore = createInMemoryLlmConfigStore();
    upstreamCalls = [];
    upstreamBehavior = "ok";
    app = Fastify({ logger: false });
    registerInternalAgentLlmConfigRoutes(app, { store: llmStore, configToken: CONFIG_TOKEN });
    await app.ready();

    fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation((async (
      input: unknown,
      init?: RequestInit,
    ): Promise<Response> => {
      const url = String(input);
      if (url.startsWith(API_ORIGIN)) {
        const u = new URL(url);
        const injected = await app.inject({
          method: init?.method ?? "GET",
          url: `${u.pathname}${u.search}`,
          headers: (init?.headers ?? {}) as Record<string, string>,
          payload: init?.body as string | undefined,
        });
        return new Response(injected.body, {
          status: injected.statusCode,
          headers: injected.headers as unknown as HeadersInit,
        });
      }
      if (url.startsWith("https://api.openai.com/")) {
        upstreamCalls.push({ url, init });
        if (upstreamBehavior === "http500") {
          return new Response(JSON.stringify({ error: { message: "upstream boom" } }), {
            status: 500,
            headers: { "content-type": "application/json" },
          });
        }
        return new Response(sseChunk("E2E ok: saldo R$ 42,00"), {
          status: 200,
          headers: { "content-type": "text/event-stream" },
        });
      }
      throw new Error(`unexpected fetch in E2E: ${url}`);
    }) as typeof fetch);
  });

  afterEach(async () => {
    fetchSpy.mockRestore();
    await app.close();
  });

  const makeAgent = () => {
    const agent = Object.create(FinanceChatAgent.prototype) as FinanceChatAgent & {
      env: Record<string, string | undefined>;
    };
    agent.env = { API_ORIGIN, AGENT_CONFIG_TOKEN: CONFIG_TOKEN, OPENAI_API_KEY: OPENAI_KEY };
    return agent;
  };

  it("happy: snapshot servido pela API vira inferência do agent via fake upstream", async () => {
    await seedActivePair();
    const agent = makeAgent();
    const out = (await agent.onChatMessage({
      text: "Qual o meu saldo?",
      intentionId: "e2e-happy-1",
    })) as unknown as ChatResult;
    await expect(readText(out)).resolves.toContain("E2E ok");
    expect(upstreamCalls).toHaveLength(1);
    const call = upstreamCalls[0]!;
    // AI SDK v5 serves OpenAI-native models through the Responses API.
    expect(call.url).toBe("https://api.openai.com/v1/responses");
    const headers = new Headers(call.init?.headers as HeadersInit);
    expect(headers.get("authorization")).toBe(`Bearer ${OPENAI_KEY}`);
  });

  it("falha 1: upstream 500 vira erro operacional sem vazar segredo", async () => {
    await seedActivePair();
    upstreamBehavior = "http500";
    const agent = makeAgent();
    const out = (await agent.onChatMessage({
      text: "Qual o meu saldo?",
      intentionId: "e2e-up500-1",
    })) as unknown as ChatResult;
    // AI SDK v5: a dead stream rejects consumption with a typed operational
    // error (after SDK retries). It must never resolve success content,
    // never leak the secret, never echo raw upstream bytes.
    await expect(readText(out)).rejects.toThrow(/No output generated/);
    const failure = await readText(out).then(
      () => "",
      (err: unknown) => String((err as Error)?.message ?? err),
    );
    expect(failure).not.toContain("E2E ok");
    expect(failure).not.toContain(OPENAI_KEY);
    expect(failure).not.toContain("upstream boom");
    expect(upstreamCalls.length).toBeGreaterThanOrEqual(1);
  }, 60_000);

  it("falha 2: snapshot fail-closed (par desativado) nunca alcança o upstream", async () => {
    // Linha legada/malformada: runtime aponta para um par desativado.
    // A projeção da API lê como disabled e o agent recusa antes de executar.
    await app.close();
    llmStore = createInMemoryLlmConfigStore({
      providers: [
        {
          id: "openai-api",
          kind: "openai-api",
          transport: "direct",
          authMode: "api-key",
          secretAlias: "OPENAI_API_KEY",
          enabled: false,
          eligibility: "approved",
          runtimeStatus: "ready",
        },
      ],
      models: [
        {
          id: "openai-api:gpt-4o",
          providerId: "openai-api",
          modelId: "gpt-4o",
          protocol: "chat-completions",
          privacyClass: "training_prohibited",
          retention: null,
          enabled: true,
        },
      ],
      runtime: { providerId: "openai-api", modelId: "openai-api:gpt-4o" },
    });
    app = Fastify({ logger: false });
    registerInternalAgentLlmConfigRoutes(app, { store: llmStore, configToken: CONFIG_TOKEN });
    await app.ready();

    const agent = makeAgent();
    const out = (await agent.onChatMessage({
      text: "Qual o meu saldo?",
      intentionId: "e2e-disabled-1",
    })) as unknown as { text?: string };
    expect(out.text).toContain("provider not configured");
    expect(upstreamCalls).toHaveLength(0);
  });
});
