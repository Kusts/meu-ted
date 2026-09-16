import { type DelegatedRole } from "./delegated-token";

export type WorkspaceAuthorization = { actorId: string; role: DelegatedRole; workspaceId: string; deviceId?: string };

export async function authorizeWorkspaceMembership(
  request: Request,
  env: { API_ORIGIN: string; AGENT_CONNECTION_TOKEN_SECRET?: string; AGENT_AUTH_SERVICE_TOKEN?: string },
  workspaceId: string,
): Promise<Response | WorkspaceAuthorization> {
  // Preferred path: short-lived connection token (JWT) issued by the API —
  // browsers cannot forward the api.synkroo.com.br session cookie cross-site
  // to the Worker, so cookie fallback below only serves same-origin clients.
  const connectionToken = request.headers.get("x-agent-connection-token")?.trim();
  if (connectionToken && env.AGENT_CONNECTION_TOKEN_SECRET) {
    const serviceToken = env.AGENT_AUTH_SERVICE_TOKEN?.trim();
    if (!serviceToken) {
      return Response.json({ code: "agent.service_token_missing", message: "AGENT_AUTH_SERVICE_TOKEN is required" }, { status: 500 });
    }
    const { resolveCanonicalHouseholdId } = await import("./auth/workspace-alias.js");
    // C-02 fail-closed: never accept the received alias when the
    // authoritative resolution cannot confirm the canonical id.
    let canonicalWorkspaceId: string;
    try {
      canonicalWorkspaceId = await resolveCanonicalHouseholdId(env.API_ORIGIN, serviceToken, workspaceId);    } catch {
      return Response.json({ code: "agent.membership_unavailable", message: "Workspace resolution unavailable" }, { status: 503 });
    }
    const { verifyAgentConnectionToken, consumeAgentToken } = await import("./auth/connection-token.js");
    try {
      const claims = await verifyAgentConnectionToken(connectionToken, env.AGENT_CONNECTION_TOKEN_SECRET, canonicalWorkspaceId);
      if (claims.workspace !== canonicalWorkspaceId) return Response.json({ code: "agent.workspace_forbidden" }, { status: 403 });
      // C-01 + M-09: consume the jti exactly once after signature,
      // membership and workspace validation, before accepting the
      // connection/turn. A 409 means the token was already used (replay).
      let consumed: boolean;
      try {
        consumed = await consumeAgentToken(env.API_ORIGIN, serviceToken, {
          jti: claims.jti,
          workspaceId: canonicalWorkspaceId,
          actorId: claims.sub,
          expiresAt: claims.exp * 1000,
        });
      } catch (consumeErr) {
        // M-09: the authority refused consumption because the membership was
        // revoked after mint — deny as forbidden, not as a generic outage.
        const status = (consumeErr as { status?: number })?.status;
        if (status === 401 || status === 403) {
          return Response.json({ code: "agent.workspace_forbidden", message: "Access to workspace forbidden" }, { status: 403 });
        }
        return Response.json({ code: "agent.membership_unavailable", message: "Token consumption unavailable" }, { status: 503 });
      }
      if (!consumed) {
        return Response.json({ code: "agent.token_replayed", message: "Connection token already consumed" }, { status: 401 });
      }
      const role = claims.role === "owner" ? "owner" as DelegatedRole : "member" as DelegatedRole;
      // H-12: the device binding travels with the authorization so the
      // Worker can stamp x-agent-device (never a free client header).
      return {
        actorId: claims.sub,
        role,
        workspaceId: canonicalWorkspaceId,
        ...(typeof claims.deviceId === "string" && claims.deviceId ? { deviceId: claims.deviceId } : {}),
      };
    } catch (err) {
      // Preserve the explicit replay signal when it surfaces as an error.
      if ((err as Error)?.message?.includes("token_replayed")) {
        return Response.json({ code: "agent.token_replayed", message: "Connection token already consumed" }, { status: 401 });
      }
      return Response.json({ code: "agent.workspace_forbidden" }, { status: 403 });
    }
  }

  const apiUrl = new URL(`/workspaces/${encodeURIComponent(workspaceId)}/members`, env.API_ORIGIN);
  const headers = new Headers();
  const cookie = request.headers.get("cookie");
  const origin = request.headers.get("origin");
  if (cookie) headers.set("cookie", cookie);
  if (origin) headers.set("origin", origin);
  const response = await fetch(apiUrl, { headers });
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      return Response.json({ code: "agent.workspace_forbidden" }, { status: response.status });
    }
    return Response.json({ code: "agent.membership_unavailable" }, { status: 503 });
  }

  const sessionResponse = await fetch(new URL("/auth/get-session", env.API_ORIGIN), { headers });
  if (!sessionResponse.ok) return Response.json({ code: "agent.session_required" }, { status: 401 });
  const session = await sessionResponse.json() as { user?: { id?: unknown } };
  const actorId = typeof session.user?.id === "string" ? session.user.id : undefined;
  if (!actorId) return Response.json({ code: "agent.session_required" }, { status: 401 });
  const membership = await response.clone().json() as { items?: Array<{ userId?: unknown; role?: unknown }> };
  const member = membership.items?.find((item) => item.userId === actorId);
  if (!member || (member.role !== 'owner' && member.role !== 'member')) return Response.json({ code: "agent.workspace_forbidden" }, { status: 403 });
  // C-05: the cookie fallback also names the DO by canonical id whenever the
  // authority is reachable (service token configured). Unresolvable alias →
  // deny (503). Without a service token the id stays unresolved (legacy
  // degraded path, documented in docs/ops/do-canonical-namespace.md).
  const serviceToken = env.AGENT_AUTH_SERVICE_TOKEN?.trim();
  if (serviceToken) {
    try {
      const { requireCanonicalWorkspaceId } = await import("./auth/workspace-alias.js");
      const { canonical } = await requireCanonicalWorkspaceId(env.API_ORIGIN, serviceToken, workspaceId);
      return { actorId, role: member.role, workspaceId: canonical };
    } catch {
      return Response.json({ code: "agent.membership_unavailable", message: "Workspace resolution unavailable" }, { status: 503 });
    }
  }
  return { actorId, role: member.role, workspaceId };
}
