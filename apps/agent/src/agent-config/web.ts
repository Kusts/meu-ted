/**
 * Web access (Part A, item 15): provider-abstracted search + SSRF-safe fetch.
 *
 * - Search providers resolve from env: TAVILY_API_KEY, then BRAVE_API_KEY.
 *   With neither, the provider reports `available: false` and the tool
 *   answers gracefully ("busca web indisponível") — no key is ever required
 *   in code or tests (fetchImpl is injectable, tests use mocks).
 * - webFetch only allows http/https, blocks private/loopback/link-local
 *   hosts and metadata IPs, follows at most 3 redirects (re-validated),
 *   times out in 10s and truncates the body. Keys never appear in errors.
 */

export type WebSearchResultItem = {
  title: string;
  url: string;
  snippet: string;
};

export type WebSearchResult = {
  provider: 'tavily' | 'brave' | 'disabled';
  available: boolean;
  results: WebSearchResultItem[];
};

export type WebSearchProvider = {
  name: WebSearchResult['provider'];
  available: boolean;
  search: (query: string, opts?: { maxResults?: number }) => Promise<WebSearchResult>;
};

export type WebEnv = {
  TAVILY_API_KEY?: string;
  BRAVE_API_KEY?: string;
};

const clampResults = (n: number | undefined): number => Math.min(Math.max(n ?? 5, 1), 10);

const tavilyProvider = (apiKey: string, fetchImpl: typeof fetch): WebSearchProvider => ({
  name: 'tavily',
  available: true,
  search: async (query, opts) => {
    const res = await fetchImpl('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ api_key: apiKey, query, max_results: clampResults(opts?.maxResults), search_depth: 'basic' }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      throw Object.assign(new Error(`web search failed: HTTP ${res.status}`), { code: `http_${res.status}` });
    }
    const body = (await res.json().catch(() => null)) as {
      results?: Array<{ title?: unknown; url?: unknown; content?: unknown }>;
    } | null;
    const results = (Array.isArray(body?.results) ? body!.results! : [])
      .filter((r) => typeof r.url === 'string' && (r.url as string).length > 0)
      .slice(0, 10)
      .map((r) => ({
        title: typeof r.title === 'string' ? r.title : String(r.url),
        url: String(r.url),
        snippet: typeof r.content === 'string' ? (r.content as string).slice(0, 500) : '',
      }));
    return { provider: 'tavily', available: true, results };
  },
});

const braveProvider = (apiKey: string, fetchImpl: typeof fetch): WebSearchProvider => ({
  name: 'brave',
  available: true,
  search: async (query, opts) => {
    const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${clampResults(opts?.maxResults)}`;
    const res = await fetchImpl(url, {
      method: 'GET',
      headers: { 'X-Subscription-Token': apiKey, accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      throw Object.assign(new Error(`web search failed: HTTP ${res.status}`), { code: `http_${res.status}` });
    }
    const body = (await res.json().catch(() => null)) as {
      web?: { results?: Array<{ title?: unknown; url?: unknown; description?: unknown }> };
    } | null;
    const results = (Array.isArray(body?.web?.results) ? body!.web!.results! : [])
      .filter((r) => typeof r.url === 'string' && (r.url as string).length > 0)
      .slice(0, 10)
      .map((r) => ({
        title: typeof r.title === 'string' ? r.title : String(r.url),
        url: String(r.url),
        snippet: typeof r.description === 'string' ? (r.description as string).slice(0, 500) : '',
      }));
    return { provider: 'brave', available: true, results };
  },
});

const disabledProvider: WebSearchProvider = {
  name: 'disabled',
  available: false,
  search: async () => ({ provider: 'disabled', available: false, results: [] }),
};

export const WEB_UNAVAILABLE_MESSAGE = 'Busca web indisponível no momento — respondo com os dados do seu workspace.';

export const createWebSearchProvider = (
  env: WebEnv,
  fetchImpl: typeof fetch = fetch,
): WebSearchProvider => {
  if (env.TAVILY_API_KEY && env.TAVILY_API_KEY.trim() !== '') return tavilyProvider(env.TAVILY_API_KEY.trim(), fetchImpl);
  if (env.BRAVE_API_KEY && env.BRAVE_API_KEY.trim() !== '') return braveProvider(env.BRAVE_API_KEY.trim(), fetchImpl);
  return disabledProvider;
};

export class WebFetchBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WebFetchBlockedError';
  }
}

const BLOCKED_HOST_RE =
  /^(localhost|127\.0\.0\.1|0\.0\.0\.0|::1?|\[(::1?|::)\]|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|169\.254\.\d{1,3}\.\d{1,3}|127\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i;

export const isBlockedFetchHost = (hostname: string): boolean => {
  const host = hostname.trim().toLowerCase().replace(/\.$/, '');
  if (host === '' || host === 'localhost' || host.endsWith('.localhost')) return true;
  if (host === 'metadata.google.internal') return true;
  if (host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.lan')) return true;
  return BLOCKED_HOST_RE.test(host.replace(/^\[|\]$/g, ''));
};

export const assertFetchableUrl = (rawUrl: string): URL => {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new WebFetchBlockedError('URL inválida para leitura web.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new WebFetchBlockedError('Leitura web permite apenas endereços http/https.');
  }
  if (url.username !== '' || url.password !== '') {
    throw new WebFetchBlockedError('URL com credenciais não é permitida.');
  }
  if (isBlockedFetchHost(url.hostname)) {
    throw new WebFetchBlockedError('Endereço interno não pode ser lido pela web.');
  }
  return url;
};

export type WebFetchResult = {
  url: string;
  status: number;
  contentType: string;
  text: string;
  truncated: boolean;
};

export const WEB_FETCH_TIMEOUT_MS = 10_000;
export const WEB_FETCH_MAX_CHARS = 50_000;
const WEB_FETCH_MAX_REDIRECTS = 3;

/**
 * SSRF-safe fetch: http/https only, no private hosts (re-validated on
 * every redirect hop), 10s budget, truncated text body.
 */
export const webFetchUrl = async (
  rawUrl: string,
  opts?: { fetchImpl?: typeof fetch; timeoutMs?: number; maxChars?: number },
): Promise<WebFetchResult> => {
  const fetchImpl = opts?.fetchImpl ?? fetch;
  const timeoutMs = opts?.timeoutMs ?? WEB_FETCH_TIMEOUT_MS;
  const maxChars = opts?.maxChars ?? WEB_FETCH_MAX_CHARS;
  let current = assertFetchableUrl(rawUrl).toString();
  for (let hop = 0; hop <= WEB_FETCH_MAX_REDIRECTS; hop += 1) {
    const res = await fetchImpl(current, {
      method: 'GET',
      headers: { accept: 'text/html,application/json,text/plain,text/*', 'user-agent': 'MeuTed-TED/1.0' },
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
    });
    const location = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && location) {
      if (hop === WEB_FETCH_MAX_REDIRECTS) {
        throw new WebFetchBlockedError('Muitos redirecionamentos na leitura web.');
      }
      current = assertFetchableUrl(new URL(location, current).toString()).toString();
      continue;
    }
    if (!res.ok) {
      throw Object.assign(new Error(`web fetch failed: HTTP ${res.status}`), { code: `http_${res.status}` });
    }
    const contentType = res.headers.get('content-type') ?? '';
    const raw = await res.text().catch(() => '');
    const truncated = raw.length > maxChars;
    return { url: current, status: res.status, contentType, text: truncated ? raw.slice(0, maxChars) : raw, truncated };
  }
  throw new WebFetchBlockedError('Muitos redirecionamentos na leitura web.');
};
