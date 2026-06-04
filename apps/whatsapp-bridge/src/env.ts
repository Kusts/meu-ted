// ─────────────────────────────────────────────────────────────────────────────
// .env loader — no external dependencies
// Walks up from startDir looking for .env, loads key=value pairs into
// process.env (only if not already set).
// Shared by server and standalone scripts.
// ─────────────────────────────────────────────────────────────────────────────

import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

export function loadEnv(startDir: string): void {
  let dir = startDir;
  for (let i = 0; i < 5; i++) {
    const candidate = resolve(dir, '.env');
    if (existsSync(candidate)) {
      const content = readFileSync(candidate, 'utf-8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eq = trimmed.indexOf('=');
        if (eq === -1) continue;
        const key = trimmed.slice(0, eq).trim();
        let value = trimmed.slice(eq + 1).trim();
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        if (key && process.env[key] === undefined) {
          process.env[key] = value;
        }
      }
      return;
    }
    const parent = resolve(dir, '..');
    if (parent === dir) break;
    dir = parent;
  }
}
