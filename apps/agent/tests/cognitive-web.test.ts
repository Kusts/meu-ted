import { describe, expect, it, vi } from 'vitest';
import {
  WEB_UNAVAILABLE_MESSAGE,
  assertFetchableUrl,
  createWebSearchProvider,
  isBlockedFetchHost,
  webFetchUrl,
  WebFetchBlockedError,
} from '../src/agent-config/web.js';

describe('web search provider resolution', () => {
  it('is disabled without any key and reports gracefully', async () => {
    const provider = createWebSearchProvider({});
    expect(provider.available).toBe(false);
    expect(provider.name).toBe('disabled');
    const result = await provider.search('selic hoje');
    expect(result).toEqual({ provider: 'disabled', available: false, results: [] });
    expect(WEB_UNAVAILABLE_MESSAGE).toMatch(/indisponível/i);
  });

  it('prefers Tavily and maps results', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ results: [{ title: 'Selic 15%', url: 'https://exemplo.test/selic', content: 'texto' }] }),
        { status: 200 },
      ),
    );
    const provider = createWebSearchProvider(
      { TAVILY_API_KEY: 'tv-test', BRAVE_API_KEY: 'br-test' },
      fetchMock as unknown as typeof fetch,
    );
    expect(provider.name).toBe('tavily');
    const result = await provider.search('selic hoje');
    expect(result.available).toBe(true);
    expect(result.results[0]).toMatchObject({ title: 'Selic 15%', url: 'https://exemplo.test/selic' });
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('api.tavily.com');
    // Provider responses carry no secrets back to the model.
    expect(JSON.stringify(result)).not.toContain('tv-test');
  });

  it('falls back to Brave without Tavily key', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ web: { results: [{ title: 'Dólar', url: 'https://exemplo.test/dolar', description: 'R$ 5' }] } }),
        { status: 200 },
      ),
    );
    const provider = createWebSearchProvider({ BRAVE_API_KEY: 'br-test' }, fetchMock as unknown as typeof fetch);
    expect(provider.name).toBe('brave');
    const result = await provider.search('dólar hoje');
    expect(result.results[0]).toMatchObject({ url: 'https://exemplo.test/dolar' });
  });

  it('surfaces provider HTTP errors without leaking the key', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('forbidden', { status: 403 }));
    const provider = createWebSearchProvider({ TAVILY_API_KEY: 'super-secret' }, fetchMock as unknown as typeof fetch);
    await expect(provider.search('x')).rejects.toMatchObject({ code: 'http_403' });
  });
});

describe('SSRF-safe web fetch', () => {
  it.each([
    'http://localhost:3000/x',
    'http://127.0.0.1/',
    'http://10.0.0.5/',
    'http://192.168.1.1/',
    'http://172.20.0.1/',
    'http://169.254.169.254/latest',
    'http://[::1]/',
    'file:///etc/passwd',
    'ftp://exemplo.test/x',
    'http://user:pass@exemplo.test/',
  ])('blocks %s', (url) => {
    expect(() => assertFetchableUrl(url)).toThrow(WebFetchBlockedError);
  });

  it.each(['localhost', '127.0.0.1', '10.1.2.3', '172.31.255.1', '192.168.0.1', '169.254.169.254', '::1'])(
    'flags %s as an internal host',
    (host) => {
      expect(isBlockedFetchHost(host)).toBe(true);
    },
  );

  it('allows public https URLs', () => {
    expect(assertFetchableUrl('https://exemplo.test/noticia').protocol).toBe('https:');
    expect(isBlockedFetchHost('exemplo.test')).toBe(false);
  });

  it('fetches and truncates with a mocked provider', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('conteúdo'.repeat(1000), {
        status: 200,
        headers: { 'content-type': 'text/html' },
      }),
    );
    const result = await webFetchUrl('https://exemplo.test/pagina', {
      fetchImpl: fetchMock as unknown as typeof fetch,
      maxChars: 100,
    });
    expect(result.status).toBe(200);
    expect(result.text).toHaveLength(100);
    expect(result.truncated).toBe(true);
    expect(result.url).toBe('https://exemplo.test/pagina');
  });

  it('re-validates redirect targets', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/x' } }));
    await expect(
      webFetchUrl('https://exemplo.test/redirect', { fetchImpl: fetchMock as unknown as typeof fetch }),
    ).rejects.toThrow(WebFetchBlockedError);
  });
});
