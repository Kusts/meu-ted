import { routeAgentRequest, type AgentNamespace } from "agents";
import { FinanceChatAgent } from "./finance-chat-agent.js";
import { authorizeWorkspaceMembership, getAgentByName, WorkspaceAgent } from "./index.js";
import { probeProvider } from "./llm/provider-probe.js";
import { FIXED_ENDPOINTS } from "./llm/provider-registry.js";

export { FinanceChatAgent, WorkspaceAgent };

type ExportedHandler<E, U = unknown> = { fetch(request: Request, env: E, ctx?: unknown): Promise<Response> };

type Env = {
  AGENT: DurableObjectNamespace;
  FINANCE_CHAT_AGENT: DurableObjectNamespace;
  API_ORIGIN: string;
  AGENT_CONNECTION_TOKEN_SECRET?: string;
  AGENT_DELEGATION_SECRET?: string;
  AGENT_CONFIG_TOKEN?: string;
  AGENT_RUNTIME_ADMIN_TOKEN?: string;
  OPENCODE_ZEN_API_KEY?: string;
  OPENCODE_GO_API_KEY?: string;
  OPENAI_API_KEY?: string;
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
      // Route via agents SDK official router
      const routed = await routeAgentRequest(request, env as unknown as Record<string, AgentNamespace<FinanceChatAgent>>);
      if (routed) return routed;
      // Fallback: direct DO fetch with auth headers
      const headers = new Headers(request.headers);
      headers.set("x-agent-actor", auth.actorId);
      headers.set("x-agent-role", auth.role);
      headers.set("x-agent-workspace", auth.workspaceId);
      return env.FINANCE_CHAT_AGENT.get(env.FINANCE_CHAT_AGENT.idFromName(workspaceId)).fetch(new Request(request, { headers }));
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
          return env.FINANCE_CHAT_AGENT.get(env.FINANCE_CHAT_AGENT.idFromName(workspaceId)).fetch(new Request(rpcUrl, { method: "POST", headers, body: rpcBody }));
        }
        return Response.json({ code: "agent.provider_not_configured", message: "Nenhum provedor de IA ativo configurado." }, { status: 503 });
      }
      const headers = new Headers(request.headers);
      headers.set("x-agent-actor", auth.actorId);
      headers.set("x-agent-role", auth.role);
      headers.set("x-agent-workspace", auth.workspaceId);
      return getAgentByName(env.AGENT, workspaceId).fetch(new Request(request, { headers }));
    }

    return new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<Env, unknown>;
