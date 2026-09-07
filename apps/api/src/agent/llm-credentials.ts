import { getCatalogEntry, maskApiKey, type ProviderCredentialStatus } from '@pi-finance/llm-contracts';
import type { LlmConfigStore } from './llm-config-store.js';

/**
 * Credential vault (refactor item 2).
 *
 * Storage follows the current project pattern (docs/ops/agent-llm-secret-
 * provisioning.md): secrets live in the process environment (VPS env /
 * `wrangler secret put` in production), NEVER in Postgres, Git, logs or API
 * responses. The admin credential endpoints are an operational convenience
 * that overlays `process.env[<secretAlias>]` at runtime and records only a
 * masked fingerprint + timestamp in memory. On restart, keys come back from
 * the provisioned environment; the masked record is best-effort metadata.
 *
 * Reads ALWAYS return `{configured, masked}` — the full key is never
 * returned, logged or included in error payloads.
 */

type CredentialRecord = { masked: string; updatedAt: string };

const records = new Map<string, CredentialRecord>();

type RemoteCacheEntry = { at: number; models: Array<{ id: string; ownedBy?: string | null }>; cached?: never };

const remoteCache = new Map<string, { at: number; models: Array<{ id: string; ownedBy?: string | null }> }>();

export const REMOTE_MODELS_TTL_MS = 60_000;

export const __resetCredentialVaultForTests = (): void => {
  records.clear();
  remoteCache.clear();
};

const resolveAlias = async (store: LlmConfigStore, providerId: string): Promise<string> => {
  const provider = await store.getProvider(providerId);
  if (!provider) {
    throw Object.assign(new Error(`Provider ${providerId} não encontrado`), {
      statusCode: 404,
      code: 'agent.provider_not_found',
    });
  }
  if (!provider.secretAlias) {
    throw Object.assign(new Error(`provider ${providerId} has no API-key credential (browser session)`), {
      statusCode: 422,
      code: 'agent.invalid_provider',
      reason: 'provider uses browser-session auth and has no API key slot',
    });
  }
  return provider.secretAlias;
};

export const getCredentialStatus = async (
  store: LlmConfigStore,
  providerId: string,
): Promise<ProviderCredentialStatus> => {
  const alias = await resolveAlias(store, providerId);
  const envKey = (process.env[alias] ?? '').trim();
  const record = records.get(providerId) ?? null;
  if (envKey.length > 0) {
    return {
      providerId,
      configured: true,
      masked: record?.masked ?? maskApiKey(envKey),
      updatedAt: record?.updatedAt ?? null,
    };
  }
  return { providerId, configured: false, masked: null, updatedAt: record?.updatedAt ?? null };
};

export const setCredential = async (
  store: LlmConfigStore,
  providerId: string,
  apiKey: string,
  opts?: { dryRun?: boolean },
): Promise<ProviderCredentialStatus> => {
  const alias = await resolveAlias(store, providerId);
  const key = (apiKey ?? '').trim();
  if (key.length < 8 || key.length > 256) {
    throw Object.assign(new Error('api key is too short'), {
      statusCode: 400,
      code: 'agent.invalid_parameters',
      reason: 'api key is too short',
    });
  }
  const masked = maskApiKey(key);
  if (opts?.dryRun) {
    const current = await getCredentialStatus(store, providerId);
    return { providerId, configured: current.configured, masked, updatedAt: current.updatedAt };
  }
  // Runtime env overlay (never persisted to DB/Git/log).
  process.env[alias] = key;
  const record: CredentialRecord = { masked, updatedAt: new Date().toISOString() };
  records.set(providerId, record);
  remoteCache.delete(providerId);
  try {
    await store.setProviderRuntimeStatus(providerId, 'ready');
  } catch {
    // Best effort: credential storage must not fail on a status write.
  }
  return { providerId, configured: true, masked, updatedAt: record.updatedAt };
};

export const clearCredential = async (
  store: LlmConfigStore,
  providerId: string,
): Promise<ProviderCredentialStatus> => {
  const alias = await resolveAlias(store, providerId);
  delete process.env[alias];
  const previous = records.get(providerId) ?? null;
  records.delete(providerId);
  remoteCache.delete(providerId);
  try {
    await store.setProviderRuntimeStatus(providerId, 'not_configured');
  } catch {
    // Best effort.
  }
  return { providerId, configured: false, masked: null, updatedAt: previous?.updatedAt ?? null };
};

export type CredentialTestResult = {
  ready: boolean;
  code: string;
  latencyMs: number;
  providerId: string;
};

const catalogBaseUrl = (providerId: string): { baseUrl: string; modelsPath: string } | null => {
  const entry = getCatalogEntry(providerId);
  if (!entry || !entry.supportsDynamicModels || !entry.baseUrl || !entry.modelsPath) return null;
  return { baseUrl: entry.baseUrl, modelsPath: entry.modelsPath };
};

/**
 * H-06: same redirect/SSRF guard as the agent (`createSafeFetch` in
 * apps/agent/src/llm/model-factory.ts). `redirect: 'error'` stops real
 * fetch implementations from following; the explicit 3xx rejection covers
 * injected mocks that ignore redirect semantics. URLs stay exclusively
 * from the allowlisted catalog (`catalogBaseUrl`), so a misconfigured
 * upstream can never forward the `Authorization` bearer elsewhere.
 */
export const createApiSafeFetch = (fetchImpl: typeof fetch = fetch): typeof fetch => {
  return (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const res = await fetchImpl(input, { ...init, redirect: 'error' });
    if (res.status >= 300 && res.status < 400) {
      throw Object.assign(new Error('redirected request rejected by safe fetch'), {
        code: 'redirect_rejected',
      });
    }
    return res;
  }) as typeof fetch;
};

/**
 * Connection test (item 2, dry-run safe). `dryRun: true` validates shape +
 * masking WITHOUT persisting or touching the network — used by automated
 * tests so no real key is ever required in CI. Without dryRun, performs a
 * live `GET {baseUrl}/models` with the saved key (8s budget).
 */
export const testCredential = async (
  store: LlmConfigStore,
  providerId: string,
  opts?: { dryRun?: boolean; fetchImpl?: typeof fetch; now?: () => number },
): Promise<CredentialTestResult> => {
  const startedAt = (opts?.now ?? Date.now)();
  if (opts?.dryRun) {
    await getCredentialStatus(store, providerId);
    return { ready: true, code: 'dry_run_ok', latencyMs: 0, providerId };
  }
  const alias = await resolveAlias(store, providerId);
  const key = (process.env[alias] ?? '').trim();
  if (!key) return { ready: false, code: 'not_configured', latencyMs: 0, providerId };
  const target = catalogBaseUrl(providerId);
  if (!target) return { ready: false, code: 'browser_auth_required', latencyMs: 0, providerId };
  const fetchImpl = createApiSafeFetch(opts?.fetchImpl ?? fetch);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetchImpl(`${target.baseUrl.replace(/\/$/, '')}${target.modelsPath}`, {
      method: 'GET',
      // The key travels only in the Authorization header — never in logs,
      // error payloads or responses (callers return {ready, code} only).
      headers: { authorization: `Bearer ${key}`, accept: 'application/json' },
      signal: controller.signal,
    });
    const latencyMs = (opts?.now ?? Date.now)() - startedAt;
    if (res.ok) return { ready: true, code: 'ok', latencyMs, providerId };
    return { ready: false, code: `http_${res.status}`, latencyMs, providerId };
  } catch (err) {
    const latencyMs = (opts?.now ?? Date.now)() - startedAt;
    if ((err as { code?: string })?.code === 'redirect_rejected') {
      return { ready: false, code: 'redirect_rejected', latencyMs, providerId };
    }
    const isAbort = (err as { name?: string })?.name === 'AbortError';
    return { ready: false, code: isAbort ? 'timeout' : 'network_error', latencyMs, providerId };
  } finally {
    clearTimeout(timer);
  }
};

/**
 * Dynamic model listing (item 3): real-time `GET {baseUrl}/models` with the
 * saved key, 60s TTL per provider. Codex / browser-session providers return
 * an empty list with `manualEntryAllowed: true` (no public listing).
 */
export const listRemoteModels = async (
  store: LlmConfigStore,
  providerId: string,
  opts?: { fetchImpl?: typeof fetch; now?: () => number; ttlMs?: number },
): Promise<{ providerId: string; models: Array<{ id: string; ownedBy?: string | null }>; cached: boolean; manualEntryAllowed: boolean }> => {
  const now = opts?.now ?? Date.now;
  const ttlMs = opts?.ttlMs ?? REMOTE_MODELS_TTL_MS;
  const target = catalogBaseUrl(providerId);
  if (!target) return { providerId, models: [], cached: false, manualEntryAllowed: true };
  const hit = remoteCache.get(providerId);
  if (hit && now() - hit.at < ttlMs) {
    return { providerId, models: hit.models, cached: true, manualEntryAllowed: true };
  }
  const alias = await resolveAlias(store, providerId);
  const key = (process.env[alias] ?? '').trim();
  if (!key) {
    throw Object.assign(new Error('missing credential for provider'), {
      statusCode: 409,
      code: 'agent.provider_not_configured',
      reason: 'missing_credential',
    });
  }
  const fetchImpl = createApiSafeFetch(opts?.fetchImpl ?? fetch);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetchImpl(`${target.baseUrl.replace(/\/$/, '')}${target.modelsPath}`, {
      method: 'GET',
      headers: { authorization: `Bearer ${key}`, accept: 'application/json' },
      signal: controller.signal,
    });
    if (!res.ok) {
      throw Object.assign(new Error(`model listing failed: HTTP ${res.status}`), {
        statusCode: 502,
        code: `http_${res.status}`,
      });
    }
    const body = (await res.json().catch(() => null)) as { data?: Array<{ id?: unknown; owned_by?: unknown }> } | null;
    const items = Array.isArray(body?.data) ? body!.data! : [];
    const models = items
      .filter((m) => typeof m.id === 'string' && (m.id as string).length > 0)
      .slice(0, 500)
      .map((m) => ({
        id: String(m.id),
        ...(typeof m.owned_by === 'string' ? { ownedBy: m.owned_by as string } : {}),
      }));
    remoteCache.set(providerId, { at: now(), models });
    return { providerId, models, cached: false, manualEntryAllowed: true };
  } finally {
    clearTimeout(timer);
  }
};
