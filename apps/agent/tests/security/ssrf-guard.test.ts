import { describe, expect, it, vi } from 'vitest';
import {
  assertSafeUrl,
  fetchWithSsrfGuard,
  isBlockedIp,
  resolveAndValidateHost,
  SsrfBlockedError,
  type HostResolver,
} from '../../src/security/ssrf-guard.js';

const publicLookup: HostResolver = async (host) => {
  if (host === 'exemplo.test') return ['93.184.216.34'];
  if (host === 'alvo.test') return ['203.0.113.10'];
  throw new Error(`unexpected host in test: ${host}`);
};

const rebindingLookup: HostResolver = async (host) => {
  if (host === 'evil.test') return ['127.0.0.1'];
  return publicLookup(host);
};

describe('isBlockedIp (SPEC §15.4)', () => {
  it.each([
    '127.0.0.1',
    '10.0.0.5',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.1',
    '169.254.169.254',
    '0.0.0.0',
    '224.0.0.1',
    '::1',
    '::',
    'fe80::1',
    'fc00::1',
    'fd00::5',
    'ff02::1',
    '::ffff:127.0.0.1',
    '::ffff:10.0.0.1',
    '::ffff:169.254.169.254',
  ])('blocks %s', (ip) => {
    expect(isBlockedIp(ip)).toBe(true);
  });

  it.each(['8.8.8.8', '1.1.1.1', '93.184.216.34', '2001:4860:4860::8888'])(
    'allows public %s',
    (ip) => {
      expect(isBlockedIp(ip)).toBe(false);
    },
  );
});

describe('assertSafeUrl (scheme, credentials, ports)', () => {
  it('rejects non-http schemes and credentialed URLs', () => {
    expect(() => assertSafeUrl('file:///etc/passwd')).toThrow(SsrfBlockedError);
    expect(() => assertSafeUrl('ftp://exemplo.test/x')).toThrow(SsrfBlockedError);
    expect(() => assertSafeUrl('http://user:pass@exemplo.test/')).toThrow(SsrfBlockedError);
  });

  it('rejects arbitrary ports by default (only 80/443)', () => {
    expect(() => assertSafeUrl('http://exemplo.test:22/')).toThrow(SsrfBlockedError);
    expect(() => assertSafeUrl('https://exemplo.test:8080/')).toThrow(SsrfBlockedError);
    expect(assertSafeUrl('https://exemplo.test/').protocol).toBe('https:');
    expect(assertSafeUrl('http://exemplo.test:80/x').protocol).toBe('http:');
  });

  it('honours a configured port allowlist', () => {
    expect(assertSafeUrl('https://exemplo.test:8443/x', { allowedPorts: [443, 8443] }).port).toBe(
      '8443',
    );
    expect(() => assertSafeUrl('https://exemplo.test:22/', { allowedPorts: [443, 8443] })).toThrow(
      SsrfBlockedError,
    );
  });
});

describe('resolveAndValidateHost (DNS rebinding)', () => {
  it('blocks a hostname that resolves to a private IP', async () => {
    await expect(resolveAndValidateHost('evil.test', rebindingLookup)).rejects.toThrow(
      SsrfBlockedError,
    );
  });

  it('blocks when ANY resolved address is private', async () => {
    const mixed: HostResolver = async () => ['93.184.216.34', '10.0.0.9'];
    await expect(resolveAndValidateHost('mix.test', mixed)).rejects.toThrow(SsrfBlockedError);
  });

  it('accepts a hostname that resolves to public IPs only', async () => {
    await expect(resolveAndValidateHost('exemplo.test', publicLookup)).resolves.toEqual([
      '93.184.216.34',
    ]);
  });

  it('fails closed when DNS resolution fails', async () => {
    const failing: HostResolver = async () => {
      throw new Error('ENOTFOUND');
    };
    await expect(resolveAndValidateHost('exemplo.test', failing)).rejects.toThrow(SsrfBlockedError);
  });
});

describe('fetchWithSsrfGuard (redirects re-validated, capped)', () => {
  it('blocks a redirect whose target resolves to a private IP', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(null, { status: 302, headers: { location: 'http://evil.test/x' } }),
    );
    await expect(
      fetchWithSsrfGuard('https://exemplo.test/start', {
        fetchImpl: fetchMock as unknown as typeof fetch,
        lookup: rebindingLookup,
      }),
    ).rejects.toThrow(SsrfBlockedError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('caps redirect chains', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(null, { status: 302, headers: { location: 'https://alvo.test/next' } }),
    );
    await expect(
      fetchWithSsrfGuard('https://exemplo.test/start', {
        fetchImpl: fetchMock as unknown as typeof fetch,
        lookup: publicLookup,
        maxRedirects: 2,
      }),
    ).rejects.toThrow(SsrfBlockedError);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('fetches a public URL end to end', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('ok', { status: 200, headers: { 'content-type': 'text/plain' } }),
    );
    const result = await fetchWithSsrfGuard('https://exemplo.test/pagina', {
      fetchImpl: fetchMock as unknown as typeof fetch,
      lookup: publicLookup,
    });
    expect(result.status).toBe(200);
    expect(result.text).toBe('ok');
  });
});
