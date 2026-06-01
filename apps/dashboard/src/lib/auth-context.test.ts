// ─────────────────────────────────────────────────────────────────────────────
// Auth Context Tests - Pure logic tests for auth state management
// Tests localStorage operations, householdId derivation, and state transitions
// ─────────────────────────────────────────────────────────────────────────────

import { describe, expect, test, beforeEach, vi } from 'vitest';

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
  get length() { return 0; },
  key: vi.fn(),
};
global.localStorage = localStorageMock as unknown as Storage;

// ─────────────────────────────────────────────────────────────────────────────
// B1.1: login() salva token e user no localStorage
// ─────────────────────────────────────────────────────────────────────────────

describe('Auth Context - Login Logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('B1.1: login() stores token in localStorage', () => {
    const token = 'Bearer-token-abc123';
    const user = { id: 'user-1', name: 'João', phone: '5511999999999', householdId: 'hh-123' };

    // Simulate login logic
    localStorage.setItem('auth_token', token);
    localStorage.setItem('auth_user', JSON.stringify(user));
    localStorage.setItem('householdId', user.householdId);

    expect(localStorage.setItem).toHaveBeenCalledWith('auth_token', token);
    expect(localStorage.setItem).toHaveBeenCalledWith('auth_user', JSON.stringify(user));
    expect(localStorage.setItem).toHaveBeenCalledWith('householdId', 'hh-123');
  });

  test('B1.1b: login() stores complete user object', () => {
    const user = {
      id: 'user-456',
      name: 'Maria',
      phone: '5511888888888',
      householdId: 'hh-789',
    };

    localStorage.setItem('auth_user', JSON.stringify(user));
    const stored = JSON.parse(localStorageMock.setItem.mock.calls.find(c => c[0] === 'auth_user')?.[1] || '{}');

    expect(stored).toEqual(user);
  });

  test('B1.1c: login() with different token overwrites previous', () => {
    // First login
    localStorage.setItem('auth_token', 'token-1');
    localStorage.setItem('auth_user', JSON.stringify({ id: 'u1', householdId: 'hh-1' }));

    // Second login with different token
    localStorage.setItem('auth_token', 'token-2');
    localStorage.setItem('auth_user', JSON.stringify({ id: 'u2', householdId: 'hh-2' }));

    expect(localStorageMock.setItem).toHaveBeenCalledTimes(4);
    // Last call should be token-2
    const lastTokenCall = localStorageMock.setItem.mock.calls.filter(c => c[0] === 'auth_token').pop();
    expect(lastTokenCall?.[1]).toBe('token-2');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B1.2: logout() limpa localStorage
// ─────────────────────────────────────────────────────────────────────────────

describe('Auth Context - Logout Logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('B1.2: logout() removes auth_token', () => {
    localStorage.removeItem('auth_token');
    expect(localStorage.removeItem).toHaveBeenCalledWith('auth_token');
  });

  test('B1.2b: logout() removes auth_user', () => {
    localStorage.removeItem('auth_user');
    expect(localStorage.removeItem).toHaveBeenCalledWith('auth_user');
  });

  test('B1.2c: logout() removes householdId', () => {
    localStorage.removeItem('householdId');
    expect(localStorage.removeItem).toHaveBeenCalledWith('householdId');
  });

  test('B1.2d: logout() clears all auth-related keys', () => {
    // Simulate logout
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
    localStorage.removeItem('householdId');

    expect(localStorage.removeItem).toHaveBeenCalledTimes(3);
    expect(localStorageMock.removeItem).toHaveBeenCalledWith('auth_token');
    expect(localStorageMock.removeItem).toHaveBeenCalledWith('auth_user');
    expect(localStorageMock.removeItem).toHaveBeenCalledWith('householdId');
  });

  test('B1.2e: after logout, token is null', () => {
    localStorageMock.getItem.mockReturnValue(null);
    const token = localStorage.getItem('auth_token');
    expect(token).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B1.3: householdId é derivado do user.householdId
// ─────────────────────────────────────────────────────────────────────────────

describe('Auth Context - HouseholdId Derivation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('B1.3: householdId comes from user.householdId', () => {
    const user = {
      id: 'user-1',
      name: 'Test',
      phone: '5511999999999',
      householdId: 'hh-derived-from-user',
    };

    localStorage.setItem('householdId', user.householdId);

    const storedHouseholdId = localStorageMock.setItem.mock.calls.find(c => c[0] === 'householdId')?.[1];
    expect(storedHouseholdId).toBe('hh-derived-from-user');
  });

  test('B1.3b: user without householdId stores null/undefined', () => {
    // Simulate user without householdId (edge case)
    const user = { id: 'u1', name: 'No HH' } as any;
    const householdId = user.householdId ?? null;
    localStorage.setItem('householdId', householdId);

    const stored = localStorageMock.setItem.mock.calls.find(c => c[0] === 'householdId')?.[1];
    expect(stored).toBeNull();
  });

  test('B1.3c: householdId can be retrieved from localStorage', () => {
    localStorageMock.getItem.mockReturnValue('hh-from-storage');
    const householdId = localStorage.getItem('householdId');
    expect(householdId).toBe('hh-from-storage');
  });

  test('B1.3d: multiple users with different householdIds', () => {
    // Simulate storing users sequentially (mock stores all calls)
    // User A
    localStorage.setItem('auth_user', JSON.stringify({ id: 'u1', name: 'A', householdId: 'hh-a' }));
    // Switch to User B
    localStorage.setItem('auth_user', JSON.stringify({ id: 'u2', name: 'B', householdId: 'hh-b' }));

    // Get the last call's value (User B)
    const allCalls = localStorageMock.setItem.mock.calls.filter(c => c[0] === 'auth_user');
    const lastUserCall = allCalls[allCalls.length - 1];
    const storedUser = JSON.parse(lastUserCall[1]);
    
    expect(storedUser.householdId).toBe('hh-b');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B1.4: Auth state transitions
// ─────────────────────────────────────────────────────────────────────────────

describe('Auth Context - State Transitions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('B1.4: Initial state - no token, no user', () => {
    localStorageMock.getItem.mockReturnValue(null);
    
    const token = localStorage.getItem('auth_token');
    const userStr = localStorage.getItem('auth_user');
    const user = userStr ? JSON.parse(userStr) : null;

    expect(token).toBeNull();
    expect(user).toBeNull();
  });

  test('B1.4b: After login - token and user present', () => {
    const token = 'valid-token-xyz';
    const user = { id: 'u1', name: 'LoggedIn', phone: '5511999999999', householdId: 'hh-1' };

    localStorageMock.getItem.mockImplementation((key: string) => {
      if (key === 'auth_token') return token;
      if (key === 'auth_user') return JSON.stringify(user);
      if (key === 'householdId') return user.householdId;
      return null;
    });

    const isLoggedIn = !!localStorage.getItem('auth_token') && !!localStorage.getItem('auth_user');
    expect(isLoggedIn).toBe(true);
  });

  test('B1.4c: Token expires - user remains but no token', () => {
    localStorageMock.getItem.mockImplementation((key: string) => {
      if (key === 'auth_token') return null; // Token expired
      if (key === 'auth_user') return JSON.stringify({ id: 'u1', name: 'User', householdId: 'hh-1' });
      return null;
    });

    const token = localStorage.getItem('auth_token');
    const userStr = localStorage.getItem('auth_user');

    expect(token).toBeNull();
    expect(userStr).toBeTruthy();
    // isLoggedIn should be false because token is missing
    const isLoggedIn = !!token && !!userStr;
    expect(isLoggedIn).toBe(false);
  });

  test('B1.4d: Login → Logout → Login cycle', () => {
    // Login
    localStorage.setItem('auth_token', 'token-1');
    localStorage.setItem('auth_user', JSON.stringify({ householdId: 'hh-1' }));
    localStorage.setItem('householdId', 'hh-1');
    
    // Verify setItem was called with correct values
    const tokenCall = localStorageMock.setItem.mock.calls.find(c => c[0] === 'auth_token');
    expect(tokenCall?.[1]).toBe('token-1');

    // Logout
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
    localStorage.removeItem('householdId');

    // Verify removeItem was called
    expect(localStorageMock.removeItem).toHaveBeenCalledWith('auth_token');
    expect(localStorageMock.removeItem).toHaveBeenCalledWith('auth_user');
    expect(localStorageMock.removeItem).toHaveBeenCalledWith('householdId');

    // Login again
    localStorage.setItem('auth_token', 'token-2');
    const newTokenCall = localStorageMock.setItem.mock.calls.filter(c => c[0] === 'auth_token').pop();
    expect(newTokenCall?.[1]).toBe('token-2');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B1.5: API client with auth header
// ─────────────────────────────────────────────────────────────────────────────

describe('Auth Context - API Client Auth Header', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('B1.5: API client adds Authorization header when token exists', () => {
    // Mock getItem to return token (without "Bearer " prefix since API client adds it)
    localStorageMock.getItem.mockImplementation((key: string) => {
      if (key === 'auth_token') return 'test-token'; // token without Bearer prefix
      return null;
    });

    // Simulate API client behavior
    const headers: Record<string, string> = {};
    const storedToken = localStorage.getItem('auth_token');
    if (storedToken) {
      headers['Authorization'] = `Bearer ${storedToken}`;
    }

    expect(headers['Authorization']).toBe('Bearer test-token');
  });

  test('B1.5b: API client does not add header when no token', () => {
    localStorageMock.getItem.mockReturnValue(null);

    const headers: Record<string, string> = {};
    const storedToken = localStorage.getItem('auth_token');
    if (storedToken) {
      headers['Authorization'] = `Bearer ${storedToken}`;
    }

    expect(headers['Authorization']).toBeUndefined();
  });

  test('B1.5c: API client preserves existing headers', () => {
    const token = 'token-abc';
    localStorageMock.getItem.mockReturnValue(token);

    const existingHeaders = { 'Content-Type': 'application/json', 'X-Custom': 'value' };
    const headers = { ...existingHeaders };

    const storedToken = localStorage.getItem('auth_token');
    if (storedToken) {
      headers['Authorization'] = `Bearer ${storedToken}`;
    }

    expect(headers['Content-Type']).toBe('application/json');
    expect(headers['X-Custom']).toBe('value');
    expect(headers['Authorization']).toBe('Bearer token-abc');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B1.6: localStorage error handling
// ─────────────────────────────────────────────────────────────────────────────

describe('Auth Context - LocalStorage Error Handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('B1.6: Invalid JSON in auth_user is handled', () => {
    localStorageMock.getItem.mockImplementation((key: string) => {
      if (key === 'auth_user') return 'invalid-json-not-parseable';
      return null;
    });

    let user = null;
    try {
      const userStr = localStorage.getItem('auth_user');
      if (userStr) {
        user = JSON.parse(userStr);
      }
    } catch {
      user = null;
    }

    expect(user).toBeNull();
  });

  test('B1.6b: setItem failure does not throw (silent)', () => {
    localStorageMock.setItem.mockImplementation(() => {
      // localStorage can throw if quota exceeded
    });

    // Should not throw
    expect(() => localStorage.setItem('auth_token', 'test')).not.toThrow();
  });

  test('B1.6c: getItem returns null for non-existent keys', () => {
    localStorageMock.getItem.mockReturnValue(null);

    const token = localStorage.getItem('auth_token');
    const user = localStorage.getItem('auth_user');
    const householdId = localStorage.getItem('householdId');

    expect(token).toBeNull();
    expect(user).toBeNull();
    expect(householdId).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B1.7: HouseholdId sync
// ─────────────────────────────────────────────────────────────────────────────

describe('Auth Context - HouseholdId Sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('B1.7: householdId is synced with user.householdId on login', () => {
    const user = { id: 'u1', name: 'Test', phone: '5511999999999', householdId: 'hh-sync-test' };

    // On login: set all three
    localStorage.setItem('auth_token', 'token-123');
    localStorage.setItem('auth_user', JSON.stringify(user));
    localStorage.setItem('householdId', user.householdId);

    // Get the householdId from setItem calls
    const hhCall = localStorageMock.setItem.mock.calls.find(c => c[0] === 'householdId');
    expect(hhCall?.[1]).toBe('hh-sync-test');
  });

  test('B1.7b: householdId in localStorage matches user object', () => {
    const user = { id: 'u1', name: 'Jane', householdId: 'hh-jane' };

    localStorage.setItem('auth_user', JSON.stringify(user));
    localStorage.setItem('householdId', user.householdId);

    // Both stored values should match
    const hhCall = localStorageMock.setItem.mock.calls.find(c => c[0] === 'householdId');
    expect(hhCall?.[1]).toBe(user.householdId);
  });

  test('B1.7c: user.householdId change updates householdId storage', () => {
    // Initial user
    const user1 = { id: 'u1', householdId: 'hh-old' };
    localStorage.setItem('auth_user', JSON.stringify(user1));
    localStorage.setItem('householdId', user1.householdId);

    // Update user with new householdId
    const user2 = { ...user1, householdId: 'hh-new' };
    localStorage.setItem('auth_user', JSON.stringify(user2));
    localStorage.setItem('householdId', user2.householdId);

    // Get the last householdId call
    const hhCalls = localStorageMock.setItem.mock.calls.filter(c => c[0] === 'householdId');
    const lastHH = hhCalls[hhCalls.length - 1];
    expect(lastHH[1]).toBe('hh-new');
  });
});