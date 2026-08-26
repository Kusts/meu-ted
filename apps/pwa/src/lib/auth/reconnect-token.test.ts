import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { apiFetch } from "@/lib/api/client";
import { connectAuthenticatedSocket, requestReconnectToken, reconnectWithToken } from "./reconnect-token";
import { closeAllSockets, isReconnectTokenValid } from "./socket-registry";

vi.mock("@/lib/api/client", () => ({ apiFetch: vi.fn() }));
const mocked = vi.mocked(apiFetch);

beforeEach(() => mocked.mockImplementation(async (path) => path === "/auth/reconnect-token"
  ? { token: "server-token", expiresInSeconds: 300 }
  : { sessionId: "session-1" }) as never);
afterEach(() => closeAllSockets());

describe("reconnect token client boundary", () => {
  it("registers only the server-issued token for the active session", async () => {
    const token = await requestReconnectToken();
    expect(token).toBe("server-token");
    expect(isReconnectTokenValid(token)).toBe(true);
    expect(mocked).toHaveBeenCalledWith("/auth/reconnect-token", expect.objectContaining({ method: "POST" }));
  });

  it("opens a managed WebSocket only after the server handshake", async () => {
    class FakeWebSocket {
      close = vi.fn();
      addEventListener = vi.fn();
    }
    vi.stubGlobal("WebSocket", FakeWebSocket);
    const connected = await connectAuthenticatedSocket("wss://example.test/chat");
    expect(connected.sessionId).toBe("session-1");
    expect(connected.socket).toBeInstanceOf(FakeWebSocket);
    vi.unstubAllGlobals();
  });

  it("performs the server reconnect handshake with the locally valid delegated token", async () => {
    const token = await requestReconnectToken();
    await expect(reconnectWithToken(token)).resolves.toEqual({ sessionId: "session-1" });
    expect(mocked).toHaveBeenCalledWith("/auth/reconnect", expect.objectContaining({ method: "POST", body: JSON.stringify({ token: "server-token" }) }));
    closeAllSockets();
    await expect(reconnectWithToken(token)).rejects.toThrow("invalidated");
  });
});
