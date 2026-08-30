import { FinanceChatAgent } from "./finance-chat-agent.js";
import { authorizeWorkspaceMembership, WorkspaceAgent } from "./index.js";
import { probeProvider } from "./llm/provider-probe.js";
import { FIXED_ENDPOINTS } from "./llm/provider-registry.js";
import type { LegacyFullExport, MigrationResult } from "./migration/legacy-history.js";
import { redactTranscript } from "./transcript-safety.js";

export { FinanceChatAgent, WorkspaceAgent };

type ExportedHandler<E, U = unknown> = { fetch(request: Request, env: E, ctx?: unknown): Promise<Response> };

type LegacyAgentStub = {
  exportFullWorkspaceHistory?: (workspaceId: string) => Promise<LegacyFullExport>;
  fetch: (request: Request) => Promise<Response>;
};

type FinanceAgentStub = {
  importLegacyHistory?: (data: LegacyFullExport) => Promise<MigrationResult>;
  fetch: (request: Request) => Promise<Response>;
};

type TypedAgentNamespace<T> = {
  idFromName: (name: string) => DurableObjectId;
  get: (id: DurableObjectId) => T;
};

type Env = {
  AGENT: TypedAgentNamespace<LegacyAgentStub>;
  FINANCE_CHAT_AGENT: TypedAgentNamespace<FinanceAgentStub>;
  API_ORIGIN: string;
  AGENT_CONNECTION_TOKEN_SECRET?: string;
  AGENT_DELEGATION_SECRET?: string;
  AGENT_CONFIG_TOKEN?: string;
  AGENT_RUNTIME_ADMIN_TOKEN?: string;
  OPENCODE_ZEN_API_KEY?: string;
  OPENCODE_GO_API_KEY?: string;
  OPENAI_API_KEY?: string;
};

const syncLegacyHistory = async (
  env: Env,
  workspaceId: string,
  financeAgent: FinanceAgentStub,
): Promise<Response | null> => {
  try {
    if (!env.AGENT || typeof env.AGENT.idFromName !== "function" || typeof env.AGENT.get !== "function") {
      return Response.json(
        { code: "agent.history_migration_failed", message: "Legacy agent namespace is not configured" },
        { status: 503 },
      );
    }

    const legacyStub = env.AGENT.get(env.AGENT.idFromName(workspaceId));
    if (!legacyStub || typeof legacyStub.exportFullWorkspaceHistory !== "function") {
      return Response.json(
        { code: "agent.history_migration_failed", message: "Legacy agent does not support history export" },
        { status: 503 },
      );
    }

    if (!financeAgent || typeof financeAgent.importLegacyHistory !== "function") {
      return Response.json(
        { code: "agent.history_migration_failed", message: "Target FinanceChatAgent does not support history import" },
        { status: 503 },
      );
    }

    const exportData = await legacyStub.exportFullWorkspaceHistory(workspaceId);
    const importRes = await financeAgent.importLegacyHistory(exportData);
    if (!importRes.success) {
      if (importRes.reason?.includes("migration_blocked_turns_in_flight")) {
        return Response.json(
          { code: "agent.history_migration_pending", message: "Histórico em migração ou com turnos em voo." },
          { status: 409 },
        );
      }
      const safeReason = redactTranscript(importRes.reason ?? "Falha ao migrar histórico legado.");
      return Response.json(
        { code: "agent.history_migration_failed", message: safeReason },
        { status: 503 },
      );
    }

    return null;
  } catch (err) {
    const rawMsg = (err as Error)?.message ?? "Falha ao migrar histórico legado.";
    const safeMsg = redactTranscript(rawMsg);
    return Response.json(
      { code: "agent.history_migration_failed", message: safeMsg },
      { status: 503 },
    );
  }
};

const verifyAdminToken = (request: Request, adminToken?: string): boolean => {
  if (!adminToken) return false;
  const authHeader = request.headers.get("authorization");
  let bearerToken: string | undefined;
  if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
    bearerToken = authHeader.slice(7).trim();
  }
  const customHeader = request.headers.get("x-agent-runtime-admin-token");
  const provided = customHeader?.trim() || bearerToken;
  if (!provided) return false;

  const expectedBytes = new TextEncoder().encode(adminToken);
  const providedBytes = new TextEncoder().encode(provided);
  if (expectedBytes.length !== providedBytes.length) return false;

  let match = 0;
  for (let i = 0; i < expectedBytes.length; i++) {
    match |= expectedBytes[i]! ^ providedBytes[i]!;
  }
  return match === 0;
};

export default {
  async fetch(request: Request, env: Env, _ctx?: unknown): Promise<Response> {
    const url = new URL(request.url);

    const ALLOWED_ORIGINS = [
      "https://pi-finance-pwa.walissonead.workers.dev",
      "http://localhost:3000",
      "http://127.0.0.1:3000",
      "http://localhost:3001",
      "http://127.0.0.1:3001",
    ];
    const requestOrigin = request.headers.get("origin") ?? "";
    const isAllowedOrigin = ALLOWED_ORIGINS.includes(requestOrigin);
    const corsHeaders = (): Record<string, string> => ({
      "access-control-allow-origin": isAllowedOrigin ? requestOrigin : "null",
      "access-control-allow-credentials": "true",
      "access-control-allow-methods": "GET, POST, OPTIONS, DELETE",
      "access-control-allow-headers": "content-type, x-workspace-id, x-agent-connection-token, authorization",
      "access-control-max-age": "600",
    });

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(),
      });
    }

    const handle = async (): Promise<Response> => {
      if (url.pathname === "/health/agent") {
        return Response.json({ status: "ready", binding: "FINANCE_CHAT_AGENT" });
      }
      if (url.pathname === "/health") {
        return Response.json({ status: "ready", schemaVersion: 5 });
      }

    // Internal admin routes: Catalog & Provider Probe
    if (url.pathname === "/internal/agent/catalog") {
      if (!verifyAdminToken(request, env.AGENT_RUNTIME_ADMIN_TOKEN)) {
        return Response.json({ code: "agent.unauthorized", message: "Invalid runtime admin token" }, { status: 401 });
      }
      return Response.json({
        providers: Object.keys(FIXED_ENDPOINTS),
      });
    }

    if (url.pathname === "/internal/agent/probe" && request.method === "POST") {
      if (!verifyAdminToken(request, env.AGENT_RUNTIME_ADMIN_TOKEN)) {
        return Response.json({ code: "agent.unauthorized", message: "Invalid runtime admin token" }, { status: 401 });
      }
      let body: { provider?: string; model?: string };
      try {
        body = (await request.json()) as { provider?: string; model?: string };
      } catch {
        return Response.json({ code: "agent.invalid_payload", message: "Invalid JSON payload" }, { status: 400 });
      }

      if (!body.provider || !body.model) {
        return Response.json({ code: "agent.missing_parameters", message: "provider and model are required" }, { status: 400 });
      }

      const probeResult = await probeProvider(
        body.provider,
        body.model,
        env as unknown as Record<string, string | undefined>,
      );

      return Response.json(probeResult);
    }

    // SDK routing for FinanceChatAgent – authenticated before persist
    const financeMatch = url.pathname.match(/^\/agents\/finance-chat-agent\/([^/]+)/);
    if (financeMatch) {
      const workspaceId = decodeURIComponent(financeMatch[1]!);
      const auth = await authorizeWorkspaceMembership(request, env as unknown as { API_ORIGIN: string; AGENT_CONNECTION_TOKEN_SECRET?: string }, workspaceId);
      if (auth instanceof Response) return auth;

      const subPath = url.pathname.slice(financeMatch[0].length);
      const isRestRpc = subPath === "/rpc/chat" || subPath === "/rpc/history";

      if (isRestRpc) {
        const financeAgent = env.FINANCE_CHAT_AGENT.get(env.FINANCE_CHAT_AGENT.idFromName(workspaceId));
        const syncError = await syncLegacyHistory(env, workspaceId, financeAgent);
        if (syncError) return syncError;

        const headers = new Headers(request.headers);
        headers.set("x-agent-actor", auth.actorId);
        headers.set("x-agent-role", auth.role);
        headers.set("x-agent-workspace", auth.workspaceId);
        const rpcUrl = new URL(request.url);
        rpcUrl.pathname = subPath;
        return financeAgent.fetch(
          new Request(rpcUrl, { method: request.method, headers, body: request.body }),
        );
      }

      // Block all non-RPC routes to FinanceChatAgent to prevent unauthenticated/spoofed SDK routing
      return new Response("Not found", { status: 404 });
    }

    // Legacy route kept during migration
    const legacyMatch = url.pathname.match(/^\/agents\/workspace\/([^/]+)/);
    if (legacyMatch) {
      const workspaceId = decodeURIComponent(legacyMatch[1]!);
      const auth = await authorizeWorkspaceMembership(request, env as unknown as { API_ORIGIN: string; AGENT_CONNECTION_TOKEN_SECRET?: string }, workspaceId);
      if (auth instanceof Response) return auth;
      // For new message turns, route to the real FinanceChatAgent RPC when a
      // runtime provider is configured; fall back to the legacy WorkspaceAgent
      // only for history/export/stream operations that still live there.
      const isNewMessage = request.method === "POST" && url.pathname.endsWith("/message");
      if (isNewMessage) {
        const { fetchRuntimeConfig } = await import("./llm/runtime-config-client.js");
        let configured = false;
        try {
          const config = await fetchRuntimeConfig(env.API_ORIGIN, env.AGENT_CONFIG_TOKEN ?? "");
          configured = Boolean(config.activeProviderId && config.activeModelId);
        } catch {
          configured = false;
        }
        if (configured) {
          const financeAgent = env.FINANCE_CHAT_AGENT.get(env.FINANCE_CHAT_AGENT.idFromName(workspaceId));
          const syncError = await syncLegacyHistory(env, workspaceId, financeAgent);
          if (syncError) return syncError;

          const headers = new Headers(request.headers);
          headers.set("x-agent-actor", auth.actorId);
          headers.set("x-agent-role", auth.role);
          headers.set("x-agent-workspace", auth.workspaceId);
          const rpcUrl = new URL(request.url);
          rpcUrl.pathname = "/rpc/chat";
          let rpcBody = await request.text();
          try {
            const parsed = JSON.parse(rpcBody) as { content?: unknown; text?: unknown; intentionId?: unknown };
            rpcBody = JSON.stringify({ text: typeof parsed.text === "string" ? parsed.text : parsed.content, intentionId: typeof parsed.intentionId === "string" ? parsed.intentionId : undefined });
          } catch {
            // pass through original body
          }
          return financeAgent.fetch(new Request(rpcUrl, { method: "POST", headers, body: rpcBody }));
        }
        return Response.json({ code: "agent.provider_not_configured", message: "Nenhum provedor de IA ativo configurado." }, { status: 503 });
      }
      const headers = new Headers(request.headers);
      headers.set("x-agent-actor", auth.actorId);
      headers.set("x-agent-role", auth.role);
      headers.set("x-agent-workspace", auth.workspaceId);
      return env.AGENT.get(env.AGENT.idFromName(workspaceId)).fetch(new Request(request, { headers }));
    }

    return new Response("Not found", { status: 404 });
    };

    const response = await handle();
    const headers = new Headers(response.headers);
    Object.entries(corsHeaders()).forEach(([k, v]) => headers.set(k, v));
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  },
} satisfies ExportedHandler<Env, unknown>;
