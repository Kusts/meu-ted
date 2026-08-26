import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { connect } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { createReconnectSocketRegistry } from '../../src/auth/reconnect-sockets.js';
import { createReconnectTokenStore } from '../../src/auth/reconnect-tokens.js';

const servers: ReturnType<typeof createServer>[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

async function listen(server: ReturnType<typeof createServer>): Promise<number> {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return (server.address() as { port: number }).port;
}

describe('reconnect WebSocket upgrade', () => {
  it('accepts a valid token, tracks the socket, and closes it on session revocation', async () => {
    const tokens = createReconnectTokenStore();
    const token = tokens.issue('session-1', 60_000, 'user-1');
    const server = createServer();
    servers.push(server);
    const sockets = createReconnectSocketRegistry(server, tokens);
    const port = await listen(server);
    const client = connect(port, '127.0.0.1');
    await once(client, 'connect');
    client.write(`GET /auth/reconnect-ws?reconnect_token=${token} HTTP/1.1\r\nHost: localhost\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${Buffer.from('client-key').toString('base64')}\r\nSec-WebSocket-Version: 13\r\n\r\n`);
    const [response] = await once(client, 'data');
    expect(String(response)).toContain('101 Switching Protocols');
    expect(sockets.activeSessionCount()).toBe(1);
    sockets.closeSession('session-1', 'session revoked');
    await once(client, 'close');
    expect(sockets.activeSessionCount()).toBe(0);
  });

  it('rejects a revoked token during the WebSocket upgrade', async () => {
    const tokens = createReconnectTokenStore();
    const token = tokens.issue('session-1', 60_000, 'user-1');
    tokens.invalidateSession('session-1');
    const server = createServer();
    servers.push(server);
    createReconnectSocketRegistry(server, tokens);
    const port = await listen(server);
    const client = connect(port, '127.0.0.1');
    await once(client, 'connect');
    client.write(`GET /auth/reconnect-ws?reconnect_token=${token} HTTP/1.1\r\nHost: localhost\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${createHash('sha1').update('client-key').digest('base64')}\r\nSec-WebSocket-Version: 13\r\n\r\n`);
    const [response] = await once(client, 'data');
    expect(String(response)).toContain('401 Unauthorized');
    client.destroy();
  });
});
