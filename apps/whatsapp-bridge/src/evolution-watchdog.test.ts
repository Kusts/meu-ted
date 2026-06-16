import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkHealth, reconnect, watchOnce, type HealthStatus, type WatchdogResult } from './evolution-watchdog';

// ── Mocks ────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fetchMock = vi.fn() as any;
vi.stubGlobal('fetch', fetchMock);

function mockHealthResponse(status: number, body: object) {
  fetchMock.mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response);
}

const BASE = 'http://evo:4000';
const TOKEN = 'test-token';

beforeEach(() => {
  fetchMock.mockReset();
});

// ── checkHealth ──────────────────────────────────────────────────

describe('checkHealth', () => {
  it('returns healthy when Connected=true and LoggedIn=true', async () => {
    mockHealthResponse(200, { Connected: true, LoggedIn: true });

    const result = await checkHealth(BASE, TOKEN);

    const expected: HealthStatus = { healthy: true, detail: { Connected: true, LoggedIn: true } };
    expect(result).toEqual(expected);
    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE}/instance/info`,
      expect.objectContaining({ headers: expect.objectContaining({ apikey: TOKEN }) }),
    );
  });

  it('returns unhealthy when Connected=false', async () => {
    mockHealthResponse(200, { Connected: false, LoggedIn: true });

    const result = await checkHealth(BASE, TOKEN);

    expect(result.healthy).toBe(false);
  });

  it('returns unhealthy when LoggedIn=false', async () => {
    mockHealthResponse(200, { Connected: true, LoggedIn: false });

    const result = await checkHealth(BASE, TOKEN);

    expect(result.healthy).toBe(false);
  });

  it('returns unhealthy and surfaces message on HTTP error', async () => {
    mockHealthResponse(500, { error: 'Internal Server Error' });

    const result = await checkHealth(BASE, TOKEN);

    expect(result.healthy).toBe(false);
    expect(result.error).toContain('500');
  });

  it('returns unhealthy and surfaces message on network error', async () => {
    fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const result = await checkHealth(BASE, TOKEN);

    expect(result.healthy).toBe(false);
    expect(result.error).toContain('ECONNREFUSED');
  });
});

// ── reconnect ────────────────────────────────────────────────────

describe('reconnect', () => {
  it('returns true on successful reconnect (200)', async () => {
    mockHealthResponse(200, { success: true });

    const result = await reconnect(BASE, TOKEN);

    expect(result).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE}/instance/reconnect`,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ apikey: TOKEN }),
      }),
    );
  });

  it('returns false on HTTP error (status != 2xx)', async () => {
    mockHealthResponse(500, { error: 'fail' });

    const result = await reconnect(BASE, TOKEN);

    expect(result).toBe(false);
  });

  it('returns false on network error', async () => {
    fetchMock.mockRejectedValueOnce(new Error('ENOTFOUND'));

    const result = await reconnect(BASE, TOKEN);

    expect(result).toBe(false);
  });
});

// ── watchOnce ────────────────────────────────────────────────────

describe('watchOnce', () => {
  it('skips reconnect when healthy', async () => {
    mockHealthResponse(200, { Connected: true, LoggedIn: true });

    const result = await watchOnce(BASE, TOKEN);

    const expected: WatchdogResult = { reconnected: false, healthy: true, healthyAfterReconnect: true, reconnectAttempts: 0, detail: { Connected: true, LoggedIn: true } };
    expect(result).toEqual(expected);
    expect(fetchMock).toHaveBeenCalledTimes(1); // only checkHealth, no reconnect
  });

  it('attempts reconnect when unhealthy and succeeds', async () => {
    // unhealthy check
    mockHealthResponse(200, { Connected: false, LoggedIn: true });
    // reconnect success
    mockHealthResponse(200, { success: true });
    // post-reconnect health check — now healthy
    mockHealthResponse(200, { Connected: true, LoggedIn: true });

    const result = await watchOnce(BASE, TOKEN);

    expect(result).toMatchObject({ reconnected: true, healthyAfterReconnect: true });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('attempts reconnect when unhealthy and fails', async () => {
    mockHealthResponse(200, { Connected: false, LoggedIn: true });
    mockHealthResponse(500, { error: 'fail' });

    const result = await watchOnce(BASE, TOKEN);

    expect(result).toMatchObject({ reconnected: false, healthyAfterReconnect: false });
  });

  it('retries reconnect up to maxAttempts with backoff', async () => {
    // unhealthy
    mockHealthResponse(200, { Connected: false, LoggedIn: false });
    // reconnect attempts fail
    for (let i = 0; i < 3; i++) {
      mockHealthResponse(200, { success: true }); // reconnect POST returns ok
      mockHealthResponse(200, { Connected: false, LoggedIn: false }); // but health still bad
    }

    const result = await watchOnce(BASE, TOKEN, { maxReconnectAttempts: 3, backoffMs: 1 });

    expect(result.reconnectAttempts).toBe(3);
    expect(result.healthyAfterReconnect).toBe(false);
  });

  it('stops reconnect early if health is restored', async () => {
    // unhealthy
    mockHealthResponse(200, { Connected: false, LoggedIn: false });
    // reconnect success
    mockHealthResponse(200, { success: true });
    // health check after reconnect — healthy!
    mockHealthResponse(200, { Connected: true, LoggedIn: true });

    const result = await watchOnce(BASE, TOKEN, { maxReconnectAttempts: 3, backoffMs: 1 });

    expect(result.reconnectAttempts).toBe(1);
    expect(result.healthyAfterReconnect).toBe(true);
  });
});
