import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildTestApp } from '../test-app.js';

const apiRoot = existsSync(resolve(process.cwd(), 'apps/api')) ? resolve(process.cwd(), 'apps/api') : process.cwd();
const routesSource = readFileSync(resolve(apiRoot, 'src/routes/index.ts'), 'utf8');
const serverSource = readFileSync(resolve(apiRoot, 'src/server/index.ts'), 'utf8');

/**
 * Phase 7 (V4.1 Tasks 7.5-7.7): /auth/bridge-context decommission guard.
 *
 * Consumer scan (2026-09-17): zero runtime consumers of
 * POST /auth/bridge-context — no references in apps/pwa/src,
 * apps/agent/src, apps/api runtime code, scripts, or e2e. The only
 * references were docs/history and its own unit test. The route (legacy of
 * the P3-removed WhatsApp bridge) must stay unmounted; legacy callers fail
 * closed at routing (404), never with a minted token.
 */
describe('bridge-context decommission (Phase 7 guard)', () => {
  it('POST /auth/bridge-context is not mounted', async () => {
    const { app } = buildTestApp();
    const res = await app.inject({
      method: 'POST',
      url: '/auth/bridge-context',
      payload: { phone: '+5511999999999', chatId: 'chat-1', providerMessageId: 'm-1', requestId: 'r-1' },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('route registration and context-token internals are gone from composition', () => {
    for (const file of [
      'src/routes/bridge-context.ts',
      'src/auth/context-token.ts',
      'src/auth/context-token-replay.ts',
      'src/auth/context-token-replay-memory.ts',
      'src/auth/context-token-replay-postgres.ts',
      'src/auth/phone-workspace.ts',
      'src/auth/phone-workspace-postgres.ts',
    ]) {
      expect(existsSync(resolve(apiRoot, file)), `${file} must stay deleted`).toBe(false);
    }
    expect(routesSource).not.toContain('bridge-context');
    expect(routesSource).not.toContain('context-token');
    expect(routesSource).not.toContain('phone-workspace');
    expect(serverSource).not.toContain('ContextTokenReplay');
  });
});
