import { afterEach, describe, expect, it, vi } from "vitest";
import {
  closeAllSockets,
  isReconnectTokenValid,
  registerReconnectToken,
  registerSocket,
  openManagedSocket,
} from "./socket-registry";

type FakeSocket = { close: (code?: number, reason?: string) => void };

describe("socket registry", () => {
  afterEach(() => closeAllSockets());

  it("registers a real browser WebSocket and unregisters it on close", () => {
    let closeListener: (() => void) | undefined;
    class FakeWebSocket {
      close = vi.fn();
      addEventListener = (_event: string, listener: () => void) => { closeListener = listener; };
    }
    vi.stubGlobal("WebSocket", FakeWebSocket);
    const socket = openManagedSocket("wss://example.test/chat", "protocol");
    expect(socket).toBeInstanceOf(FakeWebSocket);
    closeListener?.();
    closeAllSockets();
    expect(socket.close).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("closes every active socket and invalidates reconnect tokens", () => {
    const calls: Array<[number | undefined, string | undefined]> = [];
    const socket: FakeSocket = { close: (code, reason) => calls.push([code, reason]) };
    registerSocket(socket);
    const token = registerReconnectToken("delegated-reconnect-token");

    expect(isReconnectTokenValid(token)).toBe(true);
    closeAllSockets("session revoked");

    expect(calls).toEqual([[4001, "session revoked"]]);
    expect(isReconnectTokenValid(token)).toBe(false);
  });
});
