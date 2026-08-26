import { createHash } from 'node:crypto';
import type { IncomingMessage, Server } from 'node:http';
import type { Socket } from 'node:net';
import type { ReconnectTokenStore } from './reconnect-tokens.js';

type ActiveSocket = { socket: Socket; sessionId: string };

export type ReconnectSocketRegistry = {
  closeSession(sessionId: string, reason?: string): void;
  closeSessions(sessionIds: string[], reason?: string): void;
  activeSessionCount(): number;
};

const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

export const createReconnectSocketRegistry = (server: Server, tokens: ReconnectTokenStore): ReconnectSocketRegistry => {
  const active = new Map<Socket, ActiveSocket>();

  const reject = (socket: Socket, status: string): void => {
    socket.write(`HTTP/1.1 ${status}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
    socket.destroy();
  };

  const upgrade = (request: IncomingMessage, socket: Socket): void => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    if (url.pathname !== '/auth/reconnect-ws') return;
    const token = url.searchParams.get('reconnect_token');
    const key = request.headers['sec-websocket-key'];
    const sessionId = token ? tokens.resolve(token) : null;
    if (!sessionId || typeof key !== 'string') return reject(socket, '401 Unauthorized');

    const accept = createHash('sha1').update(key + WS_GUID).digest('base64');
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    active.set(socket, { socket, sessionId });
    socket.on('close', () => active.delete(socket));
    socket.on('error', () => active.delete(socket));
  };

  server.on('upgrade', upgrade);

  return {
    closeSession(sessionId, reason = 'session revoked') {
      for (const [socket, record] of active) {
        if (record.sessionId !== sessionId) continue;
        active.delete(socket);
        socket.destroy(new Error(reason));
      }
    },
    closeSessions(sessionIds, reason) {
      for (const sessionId of sessionIds) this.closeSession(sessionId, reason);
    },
    activeSessionCount: () => active.size,
  };
};
