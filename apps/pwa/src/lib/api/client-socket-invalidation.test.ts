import { afterEach, describe, expect, it, vi } from "vitest";
import { apiGet } from "./client";
import { registerReconnectToken, registerSocket, isReconnectTokenValid } from "@/lib/auth/socket-registry";
import { z } from "zod";

describe("API auth invalidation boundary", () => {
  afterEach(() => vi.restoreAllMocks());

  it("closes sockets and invalidates reconnect tokens on 401", async () => {
    const close = vi.fn();
    registerSocket({ close });
    const token = registerReconnectToken("token-401");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ code: "auth.expired" }), { status: 401 }));

    await expect(apiGet("/protected", z.unknown())).rejects.toMatchObject({ status: 401 });
    expect(close).toHaveBeenCalledWith(4001, "session expired");
    expect(isReconnectTokenValid(token)).toBe(false);
  });
});
