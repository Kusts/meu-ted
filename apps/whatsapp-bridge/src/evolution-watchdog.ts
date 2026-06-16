// ─────────────────────────────────────────────────────────────────────────────
// Evolution Watchdog — health checker + reconnect for Evolution GO instances
// ─────────────────────────────────────────────────────────────────────────────

export interface HealthStatus {
  healthy: boolean;
  detail?: Record<string, unknown>;
  error?: string;
}

export interface WatchdogResult {
  reconnected: boolean;
  healthy: boolean;
  healthyAfterReconnect: boolean;
  reconnectAttempts: number;
  detail?: Record<string, unknown>;
  error?: string;
}

export interface WatchdogOptions {
  maxReconnectAttempts?: number;
  backoffMs?: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function fetchJson(baseUrl: string, token: string, path: string, init?: RequestInit) {
  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      apikey: token,
      ...(init?.headers as Record<string, string> ?? {}),
    },
  });
  const body = await res.json().catch(() => ({})) as Record<string, unknown>;
  return { ok: res.ok, status: res.status, body };
}

// ── Public API ───────────────────────────────────────────────────────────────

/** Query Evolution instance /instance/status and decide if healthy. */
export async function checkHealth(baseUrl: string, token: string): Promise<HealthStatus> {
  try {
    const { ok, status, body } = await fetchJson(baseUrl, token, '/instance/status');
    if (!ok) {
      return { healthy: false, detail: body, error: `HTTP ${status}` };
    }
    // Real Evolution API wraps status in a `data` envelope: { data: { Connected, LoggedIn, Name } }
    const d = (body as Record<string, unknown>).data as Record<string, unknown> | undefined;
    const connected = d?.Connected === true;
    const loggedIn = d?.LoggedIn === true;
    return {
      healthy: connected && loggedIn,
      detail: { Connected: connected, LoggedIn: loggedIn },
    };
  } catch (err) {
    return { healthy: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Ask Evolution instance to reconnect. Returns true on success. */
export async function reconnect(baseUrl: string, token: string): Promise<boolean> {
  try {
    const { ok } = await fetchJson(baseUrl, token, '/instance/reconnect', { method: 'POST' });
    return ok;
  } catch {
    return false;
  }
}

/** Check health once; if unhealthy, attempt reconnect with bounded retries and backoff. */
export async function watchOnce(baseUrl: string, token: string, options: WatchdogOptions = {}): Promise<WatchdogResult> {
  const maxAttempts = options.maxReconnectAttempts ?? 3;
  const backoffMs = options.backoffMs ?? 8000;

  const health = await checkHealth(baseUrl, token);
  if (health.healthy) {
    return {
      reconnected: false,
      healthy: true,
      healthyAfterReconnect: true,
      reconnectAttempts: 0,
      detail: health.detail,
    };
  }

  let attempts = 0;

  for (let i = 0; i < maxAttempts; i++) {
    attempts++;
    const reconnected = await reconnect(baseUrl, token);
    if (!reconnected) {
      return {
        reconnected: false,
        healthy: false,
        healthyAfterReconnect: false,
        reconnectAttempts: attempts,
        detail: health.detail,
        error: 'Reconnect HTTP failed',
      };
    }

    // After reconnect, check health again
    const newHealth = await checkHealth(baseUrl, token);
    if (newHealth.healthy) {
      return {
        reconnected: true,
        healthy: true,
        healthyAfterReconnect: true,
        reconnectAttempts: attempts,
        detail: newHealth.detail,
      };
    }

    // Still unhealthy — backoff before next attempt
    if (i < maxAttempts - 1) {
      await new Promise(r => setTimeout(r, backoffMs));
    }
  }

  return {
    reconnected: true,
    healthy: false,
    healthyAfterReconnect: false,
    reconnectAttempts: attempts,
    detail: health.detail,
  };
}
