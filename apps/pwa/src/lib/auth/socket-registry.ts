export interface ManagedSocket {
  close: (code?: number, reason?: string) => void;
}

const sockets = new Set<ManagedSocket>();
const reconnectTokens = new Set<string>();

export function registerSocket(socket: ManagedSocket): () => void {
  sockets.add(socket);
  return () => sockets.delete(socket);
}

/** Creates a browser WebSocket and binds its full lifecycle to the auth registry. */
export function openManagedSocket(url: string, protocols?: string | string[]): WebSocket {
  const socket = new WebSocket(url, protocols);
  const unregister = registerSocket(socket);
  socket.addEventListener("close", unregister, { once: true });
  return socket;
}

export function registerReconnectToken(token: string): string {
  if (token.trim()) reconnectTokens.add(token);
  return token;
}

export function isReconnectTokenValid(token: string): boolean {
  return reconnectTokens.has(token);
}

export function invalidateReconnectTokens(): void {
  reconnectTokens.clear();
}

export function closeAllSockets(reason = "session invalidated"): void {
  for (const socket of sockets) {
    try {
      socket.close(4001, reason);
    } catch {
      // A socket can fail while closing; do not prevent other sockets from closing.
    }
  }
  sockets.clear();
  invalidateReconnectTokens();
}
