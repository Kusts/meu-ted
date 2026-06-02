// ─────────────────────────────────────────────────────────────────────────────
// Production Server Entry Point
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

// ─────────────────────────────────────────────────────────────────────────────
// Load .env from project root (no dotenv dependency, pure Node 20+)
// Walks up from cwd (apps/api/) or falls back to cwd itself
// ─────────────────────────────────────────────────────────────────────────────
function findEnvFile(startDir) {
  let dir = startDir;
  for (let i = 0; i < 5; i++) {
    const candidate = resolve(dir, '.env');
    if (existsSync(candidate)) return candidate;
    const parent = resolve(dir, '..');
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}
const envPath = findEnvFile(process.cwd()) || resolve(process.cwd(), '.env');
if (existsSync(envPath)) {
  const content = readFileSync(envPath, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    // Strip surrounding quotes
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key] && key) {
      process.env[key] = value;
    }
  }
  console.log('[env] Loaded .env from', envPath);
} else {
  console.warn('[env] No .env found at', envPath);
}

import { createApp } from './app.js';
import { registerAuthRoutes } from './auth.js';

interface SeedConfig {
  householdName?: string;
  userName?: string;
  phone?: string;
}

/**
 * Attempt to seed database with initial data if configured
 * Logs warning if not configured but continues anyway
 */
async function trySeed(app: Awaited<ReturnType<typeof createApp>>, config: SeedConfig): Promise<void> {
  if (!config.phone) {
    console.log('[seed] SEED_USER_PHONE not set, skipping seed (optional)');
    return;
  }

  console.log(`[seed] Seeding household="${config.householdName}" user="${config.userName}" phone="${config.phone}"...`);

  try {
    // Register auth routes temporarily for seed
    await registerAuthRoutes(app);

    // Make seed request to ourselves
    const response = await app.inject({
      method: 'POST',
      url: '/auth/seed',
      payload: {
        householdName: config.householdName || 'Casa',
        userName: config.userName || 'Usuário',
        phone: config.phone,
      },
    });

    const body = response.json();

    if (response.statusCode >= 200 && response.statusCode < 300) {
      if (body.idempotent) {
        console.log(`[seed] Seed idempotent - household ${body.householdId} already exists`);
      } else {
        console.log(`[seed] Created household=${body.householdId} user=${body.userId}`);
      }
    } else {
      console.warn(`[seed] Warning: seed failed with ${response.statusCode}: ${body.reason}`);
    }
  } catch (err) {
    console.warn(`[seed] Warning: seed error (continuing anyway):`, err);
  }
}

async function main() {
  const seedConfig: SeedConfig = {
    householdName: process.env.SEED_HOUSEHOLD_NAME,
    userName: process.env.SEED_USER_NAME,
    phone: process.env.SEED_USER_PHONE,
  };

  const app = createApp({
    instanceToken: process.env.EVOLUTION_GO_INSTANCE_TOKEN,
    allowedGroupIds: process.env.ALLOWED_GROUP_IDS?.split(',') || [],
    registeredPhones: process.env.REGISTERED_PHONES?.split(',') || [],
  });

  // Attempt seed (optional, won't fail startup)
  await trySeed(app, seedConfig);

  const host = process.env.HOST || '0.0.0.0';
  const port = parseInt(process.env.PORT || '3000', 10);

  try {
    await app.listen({ port, host });
    console.log(`Server running at http://${host}:${port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();