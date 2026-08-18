import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { createPostgresContextTokenReplayGuard } from "../../src/auth/context-token-replay-postgres.js";

const claim = {
  jti: "11111111-1111-4111-8111-111111111111",
  workspaceId: "22222222-2222-4222-8222-222222222222",
  requestId: "request-1",
  providerMessageId: "provider-message-1",
  expiresAt: new Date("2026-08-15T12:05:00.000Z"),
};

describe("context token replay postgres guard", () => {
  it("accepts repeated calls for the same turn binding", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ jti: claim.jti }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ jti: claim.jti }] });
    const guard = createPostgresContextTokenReplayGuard({ query } as unknown as Pool);

    await expect(guard.claim(claim)).resolves.toBe(true);
    await expect(guard.claim(claim)).resolves.toBe(true);
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[0]?.[0]).toContain("ON CONFLICT (jti) DO UPDATE");
  });
  it("purges only expired claims", async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 2, rows: [] });
    const guard = createPostgresContextTokenReplayGuard({ query } as unknown as Pool);

    await expect(guard.purgeExpired()).resolves.toBe(2);
    expect(query).toHaveBeenCalledWith("DELETE FROM context_token_replays WHERE expires_at <= NOW()");
  });
  it("preserves binding for concurrent calls in one turn", async () => {
    const query = vi.fn(async () => ({ rowCount: 1, rows: [{ jti: claim.jti }] }));
    const guard = createPostgresContextTokenReplayGuard({ query } as unknown as Pool);

    const results = await Promise.all([guard.claim(claim), guard.claim(claim)]);
    expect(results).toEqual([true, true]);
    expect(query).toHaveBeenCalledTimes(2);
  });
});
