// ─────────────────────────────────────────────────────────────────────────────
// Evolution Watchdog — standalone loop runner
//
// Polls Evolution GO instance health and reconnects when unhealthy.
// Controlled via env vars (all optional, with defaults):
//   EVOLUTION_GO_API_URL            — base URL (default: http://localhost:4000)
//   EVOLUTION_GO_INSTANCE_TOKEN     — instance API token
//   WATCHDOG_INTERVAL_MS            — poll interval in ms (default: 60000)
//   WATCHDOG_MAX_RECONNECT_ATTEMPTS — max reconnect retries per cycle (default: 3)
//   WATCHDOG_BACKOFF_MS             — backoff between retries in ms (default: 8000)
// ─────────────────────────────────────────────────────────────────────────────

import { watchOnce } from './evolution-watchdog.js';
import { loadEnv } from './env.js';

function ms(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

async function main(): Promise<void> {
  loadEnv(process.cwd());

  const baseUrl = process.env.EVOLUTION_GO_API_URL ?? 'http://localhost:4000';
  const token = process.env.EVOLUTION_GO_INSTANCE_TOKEN;
  if (!token) {
    console.error('[watchdog] EVOLUTION_GO_INSTANCE_TOKEN not set — exiting');
    process.exit(1);
  }

  const intervalMs = ms(process.env.WATCHDOG_INTERVAL_MS, 60_000);
  const maxAttempts = ms(process.env.WATCHDOG_MAX_RECONNECT_ATTEMPTS, 3);
  const backoffMs = ms(process.env.WATCHDOG_BACKOFF_MS, 8_000);

  console.log(`[watchdog] Starting — interval=${intervalMs}ms maxAttempts=${maxAttempts} backoff=${backoffMs}ms`);
  console.log(`[watchdog] Evolution URL: ${baseUrl}`);

  const tick = async () => {
    const start = Date.now();
    try {
      const result = await watchOnce(baseUrl, token, {
        maxReconnectAttempts: maxAttempts,
        backoffMs,
      });
      const duration = Date.now() - start;
      if (result.healthy && !result.reconnected) {
        console.log(`[watchdog] healthy (${duration}ms)`);
      } else if (result.healthyAfterReconnect) {
        console.log(`[watchdog] reconnected successfully after ${result.reconnectAttempts} attempt(s) (${duration}ms)`);
      } else {
        console.warn(`[watchdog] unhealthy after ${result.reconnectAttempts} reconnect attempt(s) — will retry next cycle (${duration}ms)`);
        if (result.error) console.warn(`[watchdog] error: ${result.error}`);
      }
    } catch (err) {
      const duration = Date.now() - start;
      console.error(`[watchdog] tick failed (${duration}ms):`, err instanceof Error ? err.message : String(err));
    }
  };

  // Run immediately, then on interval
  await tick();
  setInterval(tick, intervalMs);
}

main().catch((err) => {
  console.error('[watchdog] fatal:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
