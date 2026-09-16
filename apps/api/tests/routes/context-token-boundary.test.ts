import { afterEach, describe, expect, it } from "vitest";
import { createContextToken } from "../../src/auth/context-token.js";
import { buildTestApp, TOKEN_A, } from "../test-app.js";
import { HOUSEHOLD_A, HOUSEHOLD_B } from "../fixtures/seed.js";

const secret = "context-boundary-test-secret";

afterEach(() => {
  delete process.env.PI_CONTEXT_TOKEN_SECRET;
});

describe("context token request boundary", () => {
  it("exposes validated claims to a handler", async () => {
    process.env.PI_CONTEXT_TOKEN_SECRET = secret;
    const { app } = buildTestApp();
    let handlerCalls = 0;
    app.get("/__context-valid", async (request) => {
      handlerCalls += 1;
      return {
        channelActorId: request.contextClaims?.channelActorId,
        workspaceId: request.contextClaims?.workspaceId,
      };
    });

    const token = await createContextToken({
      channelActorId: "actor-1",
      workspaceId: HOUSEHOLD_A,
      chatId: "120363045678901234@g.us",
      providerMessageId: "provider-1",
      requestId: "request-1",
    }, secret);
    const response = await app.inject({
      method: "GET",
      url: "/__context-valid",
      headers: { "x-device-token": TOKEN_A, "x-pi-context-token": token },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ channelActorId: "actor-1" });
    expect(handlerCalls).toBe(1);
    await app.close();
  }, 20_000);
  it("rejects an invalid token before the handler runs", async () => {
    process.env.PI_CONTEXT_TOKEN_SECRET = secret;
    const { app } = buildTestApp();
    let handlerCalls = 0;
    app.get("/__context-invalid", async () => {
      handlerCalls += 1;
      return { ok: true };
    });

    const response = await app.inject({
      method: "GET",
      url: "/__context-invalid",
      headers: { "x-device-token": TOKEN_A, "x-pi-context-token": "not-a-token" },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "auth.context_token_invalid" });
    expect(handlerCalls).toBe(0);
    await app.close();
  }, 20_000);
  it("rejects a workspace mismatch before the handler runs", async () => {
    process.env.PI_CONTEXT_TOKEN_SECRET = secret;
    const { app } = buildTestApp();
    let handlerCalls = 0;
    app.get("/__context-mismatch", async () => {
      handlerCalls += 1;
      return { ok: true };
    });
    const token = await createContextToken({
      channelActorId: "actor-1",
      workspaceId: HOUSEHOLD_B,
      chatId: "120363045678901234@g.us",
      providerMessageId: "provider-mismatch",
      requestId: "request-mismatch",
    }, secret);

    const response = await app.inject({
      method: "GET",
      url: "/__context-mismatch",
      headers: { "x-device-token": TOKEN_A, "x-pi-context-token": token },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "auth.context_workspace_mismatch" });
    expect(handlerCalls).toBe(0);
    await app.close();
  }, 20_000);
  it("rejects an expired token before the handler runs", async () => {
    process.env.PI_CONTEXT_TOKEN_SECRET = secret;
    const { app } = buildTestApp();
    let handlerCalls = 0;
    app.get("/__context-expired", async () => {
      handlerCalls += 1;
      return { ok: true };
    });
    const token = await createContextToken({
      channelActorId: "actor-1",
      workspaceId: HOUSEHOLD_A,
      chatId: "120363045678901234@g.us",
      providerMessageId: "provider-expired",
      requestId: "request-expired",
    }, secret, 1_700_000_000_000);

    const response = await app.inject({
      method: "GET",
      url: "/__context-expired",
      headers: { "x-device-token": TOKEN_A, "x-pi-context-token": token },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "auth.context_token_invalid" });
    expect(handlerCalls).toBe(0);
    await app.close();
  }, 20_000);
  it("accepts multiple API calls for one turn token", async () => {
    process.env.PI_CONTEXT_TOKEN_SECRET = secret;
    const { app } = buildTestApp();
    let handlerCalls = 0;
    app.get("/__context-multi", async () => {
      handlerCalls += 1;
      return { ok: true };
    });
    const token = await createContextToken({
      channelActorId: "actor-1",
      workspaceId: HOUSEHOLD_A,
      chatId: "120363045678901234@g.us",
      providerMessageId: "provider-multi",
      requestId: "request-multi",
    }, secret);
    const headers = { "x-device-token": TOKEN_A, "x-pi-context-token": token };

    const first = await app.inject({ method: "GET", url: "/__context-multi", headers });
    const second = await app.inject({ method: "GET", url: "/__context-multi", headers });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(handlerCalls).toBe(2);
    await app.close();
  }, 20_000);
});
