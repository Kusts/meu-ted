import { createRequire } from "node:module";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FinanceChatAgent } from "../src/finance-chat-agent.js";
import { fetchRuntimeConfig } from "../src/llm/runtime-config-client.js";
import { createInMemoryLlmConfigStore } from "../../api/src/agent/llm-config-memory.js";
import { registerInternalAgentLlmConfigRoutes } from "../../api/src/routes/internal-agent-llm-config.js";
import { registerAdminAgentLlmConfigRoutes } from "../../api/src/routes/admin-agent-llm-config.js";

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
  let adminApp: any;
  let llmStore: ReturnType<typeof createInMemoryLlmConfigStore>;
  let upstreamCalls: Array<{ url: string; init?: RequestInit }>;
  let upstreamBehavior: "ok" | "http500";
  let fetchSpy: { mockRestore: () => void };

  // Stub de sessão: o guard admin só precisa de auth.api.getSession; nenhum
  // better-auth real é necessário neste E2E (o pacote não é dependência do agent).
  const stubAuth = {
    api: {
      getSession: async () => ({
        user: { id: "e2e-admin", email: "e2e@test.com" },
        session: { id: "e2e-session" },
      }),
    },
  };

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

  const buildAdminApp = async () => {
    adminApp = Fastify({ logger: false });
    registerAdminAgentLlmConfigRoutes(adminApp, {
      auth: stubAuth as any,
      store: llmStore,
      adminEmails: ["e2e@test.com"],
      agentRuntimeOrigin: API_ORIGIN,
      agentRuntimeToken: "e2e-agent-runtime-admin-token-32-chars!",
      trustedOrigins: ["http://localhost:3000"],
      auditLog: () => {},
    });
    await adminApp.ready();
  };

  beforeEach(async () => {
    llmStore = createInMemoryLlmConfigStore();
    upstreamCalls = [];
    upstreamBehavior = "ok";
    app = Fastify({ logger: false });
    registerInternalAgentLlmConfigRoutes(app, { store: llmStore, configToken: CONFIG_TOKEN });
    await app.ready();
    await buildAdminApp();

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
    await adminApp.close();
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

  it("falha 2 (R6-rev): toggle do par ativo via rota é barrado; legado fail-closed nunca alcança o upstream", async () => {
    await seedActivePair();
    const adminHeaders = { cookie: "e2e-session", origin: "http://localhost:3000" };

    // 1. Toggle OFF do provider ativo via ROTA admin → 409: os guards valem
    // na fronteira HTTP, não só no store.
    const toggleOff = await adminApp.inject({
      method: "POST",
      url: "/admin/agent/llm-config/providers/openai-api/toggle",
      headers: adminHeaders,
      payload: { enabled: false },
    });
    expect(toggleOff.statusCode).toBe(409);
    expect(toggleOff.json()).toMatchObject({ code: "agent.runtime_in_use", reason: "active_provider" });

    // 2. Re-leitura interna: o par segue utilizável (o guard preservou a
    // executabilidade em vez de desativar o ativo).
    const stillActive = await app.inject({
      method: "GET",
      url: "/internal/agent/llm-config",
      headers: { "x-agent-config-token": CONFIG_TOKEN },
    });
    expect(stillActive.statusCode).toBe(200);
    expect(stillActive.json().activeDisabled).toBe(false);
    expect(stillActive.json().activeProvider).not.toBeNull();

    // 3. Transição legada: nenhum método do store e nenhum endpoint produz
    // par ativo desativado (o 409 acima prova os guards nas duas camadas),
    // então a linha antiga só nasce via seed de construção — como no banco
    // legado anterior aos guards. Os apps são religados ao novo store.
    await app.close();
    await adminApp.close();
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
    await buildAdminApp();

    // 4. Re-leitura interna ANTES do fail-closed: disabled, sem ids utilizáveis.
    const snap = await app.inject({
      method: "GET",
      url: "/internal/agent/llm-config",
      headers: { "x-agent-config-token": CONFIG_TOKEN },
    });
    expect(snap.statusCode).toBe(200);
    expect(snap.json().activeDisabled).toBe(true);
    expect(snap.json().activeProvider).toBeNull();
    expect(snap.json().activeModel).toBeNull();
    // O cliente real também projeta ids nulos no fail-closed.
    const clientView = await fetchRuntimeConfig(API_ORIGIN, CONFIG_TOKEN);
    expect(clientView.activeProviderId).toBeNull();
    expect(clientView.activeModelId).toBeNull();

    // 5. O agent recusa antes de executar.
    const agent = makeAgent();
    const out = (await agent.onChatMessage({
      text: "Qual o meu saldo?",
      intentionId: "e2e-disabled-1",
    })) as unknown as { text?: string };
    expect(out.text).toContain("provider not configured");
    expect(upstreamCalls).toHaveLength(0);
  });
});
