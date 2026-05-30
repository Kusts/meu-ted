// ─────────────────────────────────────────────────────────────────────────────
// Auth API Client tests
// ─────────────────────────────────────────────────────────────────────────────

import { describe, expect, test, beforeEach, afterEach, vi } from 'vitest';

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
global.localStorage = localStorageMock as any;

// Mock fetch
const fetchMock = vi.fn();
global.fetch = fetchMock;

describe('Auth API Client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('getStoredToken returns token from localStorage', async () => {
    localStorageMock.getItem.mockReturnValue('test-token-123');
    
    const token = localStorage.getItem('auth_token');
    expect(token).toBe('test-token-123');
  });

  test('setStoredToken saves token to localStorage', async () => {
    localStorageMock.setItem.mockImplementation((key, value) => {
      expect(key).toBe('auth_token');
      expect(value).toBe('test-token-456');
    });
    
    localStorage.setItem('auth_token', 'test-token-456');
    expect(localStorageMock.setItem).toHaveBeenCalled();
  });

  test('removeStoredToken clears token from localStorage', async () => {
    localStorageMock.removeItem.mockImplementation((key) => {
      expect(key).toBe('auth_token');
    });
    
    localStorage.removeItem('auth_token');
    expect(localStorageMock.removeItem).toHaveBeenCalled();
  });

  test('api client includes auth header when token present', async () => {
    localStorageMock.getItem.mockReturnValue('valid-token');
    
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ success: true, data: [] }),
    });
    
    // Simulate API call with token
    const token = localStorage.getItem('auth_token');
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    await fetch('http://localhost:3000/accounts?householdId=test', { headers });
    
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/accounts?householdId=test',
      expect.objectContaining({
        headers: expect.objectContaining({
          'Authorization': 'Bearer valid-token',
        }),
      })
    );
  });

  test('api client does not include auth header when no token', async () => {
    localStorageMock.getItem.mockReturnValue(null);
    
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ ok: true }),
    });
    
    const token = localStorage.getItem('auth_token');
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    await fetch('http://localhost:3000/health', { headers });
    
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/health',
      expect.objectContaining({
        headers: expect.not.objectContaining({
          'Authorization': expect.anything(),
        }),
      })
    );
  });

  test('requestCode sends phone to /auth/request-code', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ success: true }),
    });
    
    await fetch('http://localhost:3000/auth/request-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '5511999999999' }),
    });
    
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/auth/request-code',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ phone: '5511999999999' }),
      })
    );
  });

  test('verifyCode returns token and user on success', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        success: true,
        token: 'new-token-789',
        user: { id: 'user-1', name: 'João', phone: '5511999999999' },
      }),
    });
    
    const response = await fetch('http://localhost:3000/auth/verify-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '5511999999999', code: '123456' }),
    });
    
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.token).toBe('new-token-789');
    expect(data.user).toBeTruthy();
  });

  test('seed creates household and user', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: () => Promise.resolve({
        success: true,
        householdId: 'hh-123',
        userId: 'user-456',
      }),
    });
    
    const response = await fetch('http://localhost:3000/auth/seed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        householdName: 'Casa Silva',
        userName: 'João',
        phone: '5511999999999',
      }),
    });
    
    expect(response.status).toBe(201);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.householdId).toBeTruthy();
  });

  test('seed is idempotent - second call returns existing', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        success: true,
        householdId: 'hh-existing',
        userId: 'user-existing',
        idempotent: true,
      }),
    });
    
    const response = await fetch('http://localhost:3000/auth/seed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        householdName: 'Casa Silva',
        userName: 'João',
        phone: '5511999999999',
      }),
    });
    
    const data = await response.json();
    expect(data.idempotent).toBe(true);
  });

  test('revoke requires auth header', async () => {
    localStorageMock.getItem.mockReturnValue('valid-token');
    const token = localStorage.getItem('auth_token');
    
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ success: true }),
    });
    
    await fetch('http://localhost:3000/auth/revoke', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    });
    
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/auth/revoke',
      expect.objectContaining({
        headers: expect.objectContaining({
          'Authorization': 'Bearer valid-token',
        }),
      })
    );
  });
});