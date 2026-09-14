import { describe, it, expect, beforeEach } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { createInMemoryPhoneWorkspaceStore } from "../../src/auth/phone-workspace.js";
import { registerBridgeContextRoutes } from "../../src/routes/bridge-context.js";
import { verifyDelegatedTurnToken } from "../../src/auth/delegated-token.js";

describe("Bridge Context Identity Resolution HTTP Route", () => {
  let app: FastifyInstance;
  const SECRET = "super-secret-test-delegation-key-12345";

  const USER_1 = {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Alice Silva",
    email: "alice@example.com",
    status: "active" as const,
  };

  const WORKSPACE_1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

  beforeEach(async () => {
    app = Fastify();
    const phoneWorkspace = createInMemoryPhoneWorkspaceStore({
      users: [USER_1],
      memberships: [
        { userId: USER_1.id, householdId: WORKSPACE_1, role: "owner", status: "active" },
      ],
      bindings: [
        { phone: "+55 (11) 99999-1111", userId: USER_1.id, status: "active" },
      ],
    });

    registerBridgeContextRoutes(app, {
      phoneWorkspace,
      delegationSecret: SECRET,
    });

    await app.ready();
  });

  it("resolves phone identity and returns signed delegated token via POST /auth/bridge-context", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/bridge-context",
      payload: {
        phone: "+55 (11) 99999-1111",
        chatId: "5511999991111@s.whatsapp.net",
        providerMessageId: "msg-12345",
        requestId: "whatsapp:msg-12345",
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.user.id).toBe(USER_1.id);
    expect(body.user.name).toBe("Alice Silva");
    expect(body.workspace.id).toBe(WORKSPACE_1);
    expect(body.workspace.role).toBe("owner");
    expect(body.delegatedToken).toBeDefined();

    // Verify signature and claims of the issued delegated token
    const claims = await verifyDelegatedTurnToken(body.delegatedToken, SECRET);
    expect(claims.sub).toBe(USER_1.id);
    expect(claims.workspace).toBe(WORKSPACE_1);
    expect(claims.role).toBe("owner");
    expect(claims.request).toBe("whatsapp:msg-12345");
    // P2 remediation: least-privilege read-only allowlist, never a wildcard.
    expect(claims.capabilities).toEqual(["financial.read"]);
  });

  it("never mints a wildcard capability", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/bridge-context",
      payload: {
        phone: "+55 (11) 99999-1111",
        chatId: "5511999991111@s.whatsapp.net",
        providerMessageId: "msg-allowlist",
        requestId: "whatsapp:msg-allowlist",
      },
    });

    expect(res.statusCode).toBe(200);
    const claims = await verifyDelegatedTurnToken(res.json().delegatedToken, SECRET);
    expect(claims.capabilities).not.toContain("*");
    expect(claims.capabilities).toEqual(["financial.read"]);
  });

  it("returns 404 when phone is not bound to any user", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/bridge-context",
      payload: {
        phone: "+55 11 00000-0000",
        chatId: "chat-404",
        providerMessageId: "msg-404",
        requestId: "req-404",
      },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe("auth.user_not_found");
  });

  it("rejects invalid request payload missing required fields with 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/bridge-context",
      payload: {
        phone: "+55 11 99999-1111",
        // missing chatId, providerMessageId, requestId
      },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe("validation.error");
  });
});
