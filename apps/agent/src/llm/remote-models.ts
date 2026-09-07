import { getCatalogEntry } from './provider-registry.js';
import { createSafeFetch } from './model-factory.js';
import type { RemoteModelItem } from './provider-registry.js';

export const REMOTE_MODELS_CACHE_TTL_MS = 60_000;

type CacheEntry = { at: number; models: RemoteModelItem[] };

const cache = new Map<string, CacheEntry>();

export const clearRemoteModelsCache = (): void => {
  cache.clear();
};

/**
 * Dynamic model listing (refactor item 3): pulls the model list IN REAL TIME
 * from the provider's own API using the saved key (GET {baseUrl}/models or
 * the catalog modelsPath equivalent), with a short 60s TTL cache per
 * provider. Providers without a public listing (Codex / browser-session)
 * throw `manual_entry_required` so the UI falls back to manual model id.
 * The key travels only in the Authorization header, never in logs/results.
 */
export const fetchRemoteModels = async (
  providerId: string,
  apiKey: string,
  opts?: { customFetch?: typeof fetch; now?: () => number; ttlMs?: number },
): Promise<{ models: RemoteModelItem[]; cached: boolean; manualEntryAllowed: boolean }> => {
  const entry = getCatalogEntry(providerId);
  const now = opts?.now ?? Date.now;
  const ttlMs = opts?.ttlMs ?? REMOTE_MODELS_CACHE_TTL_MS;
  if (!entry || !entry.supportsDynamicModels || !entry.baseUrl || !entry.modelsPath) {
    return { models: [], cached: false, manualEntryAllowed: true };
  }
  const hit = cache.get(entry.id);
  if (hit && now() - hit.at < ttlMs) {
    return { models: hit.models, cached: true, manualEntryAllowed: true };
  }
  if (!apiKey || apiKey.trim() === '') {
    throw Object.assign(new Error('missing credential for provider'), { code: 'missing_credential' });
  }
  const safeFetch = createSafeFetch(opts?.customFetch ?? fetch);
  const url = `${entry.baseUrl.replace(/\/$/, '')}${entry.modelsPath}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await safeFetch(url, {
      method: 'GET',
      headers: { authorization: `Bearer ${apiKey}`, accept: 'application/json' },
      signal: controller.signal,
    });
    if (!res.ok) {
      const err = new Error(`model listing failed: HTTP ${res.status}`);
      (err as { status?: number; code?: string }).status = res.status;
      (err as { status?: number; code?: string }).code = `http_${res.status}`;
      throw err;
    }
    const body = (await res.json().catch(() => null)) as { data?: Array<{ id?: unknown; owned_by?: unknown }> } | null;
    const items = Array.isArray(body?.data) ? body!.data! : [];
    const models: RemoteModelItem[] = items
      .filter((m) => typeof m.id === 'string' && (m.id as string).length > 0)
      .slice(0, 500)
      .map((m) => ({
        id: String(m.id),
        ...(typeof m.owned_by === 'string' ? { ownedBy: m.owned_by } : {}),
      }));
    cache.set(entry.id, { at: now(), models });
    return { models, cached: false, manualEntryAllowed: true };
  } finally {
    clearTimeout(timer);
  }
};
