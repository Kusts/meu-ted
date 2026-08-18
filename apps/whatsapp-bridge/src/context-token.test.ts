import { describe, expect, it } from "vitest";
import { createBridgeContextToken, type BridgeContextClaims } from "./context-token.js";

const claims: BridgeContextClaims = {
  channelActorId: "5511999999999",
  workspaceId: "11111111-1111-4111-8111-111111111111",
  chatId: "120363045678901234@g.us",
  providerMessageId: "provider-message-1",
  requestId: "whatsapp:provider-message-1",
};

describe("bridge context token", () => {
  it("emits the API-compatible v1 payload", async () => {
    const token = await createBridgeContextToken(claims, "bridge-secret", 1_700_000_000_000);
    const [header, encodedPayload, signature] = token.split(".");
    const payload = JSON.parse(Buffer.from(encodedPayload!, "base64url").toString("utf8")) as Record<string, unknown>;

    expect(header).toBeTruthy();
    expect(signature).toBeTruthy();
    expect(payload).toMatchObject({
      iss: "pi-bridge-context",
      aud: "pi-finance-api",
      v: 1,
      sub: claims.channelActorId,
      workspace: claims.workspaceId,
      chatId: claims.chatId,
      providerMessageId: claims.providerMessageId,
      requestId: claims.requestId,
      iat: 1_700_000_000,
      exp: 1_700_000_300,
    });
  });

  it("fails closed without a secret", async () => {
    await expect(createBridgeContextToken(claims, "")).rejects.toThrow("secret is required");
  });
});
