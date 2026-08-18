import { describe, expect, it } from "vitest";
import { createInMemoryContextTokenReplayGuard } from "../../src/auth/context-token-replay-memory.js";

const claim = {
  jti: "11111111-1111-4111-8111-111111111111",
  workspaceId: "22222222-2222-4222-8222-222222222222",
  requestId: "request-1",
  providerMessageId: "provider-1",
  expiresAt: new Date(Date.now() + 60_000),
};

describe("in-memory context replay guard", () => {
  it("accepts repeated calls for the same turn binding", async () => {
    const guard = createInMemoryContextTokenReplayGuard();
    await expect(guard.claim(claim)).resolves.toBe(true);
    await expect(guard.claim(claim)).resolves.toBe(true);
    await expect(guard.claim({ ...claim, requestId: "other" })).resolves.toBe(false);
  });
});
