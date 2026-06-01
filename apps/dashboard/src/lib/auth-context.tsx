// ─────────────────────────────────────────────────────────────────────────────
// Auth Context - Centralized Auth State for Dashboard
// Manages token, user, householdId in localStorage + provides authenticated API client
// ─────────────────────────────────────────────────────────────────────────────
'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { createApiClient } from './api-client';

interface AuthUser {
  id: string;
  name: string;
  phone: string;
  householdId: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  householdId: string | null;
  isLoggedIn: boolean;
  loading: boolean;
  login: (token: string, user: AuthUser) => void;
  logout: () => void;
  apiClient: ReturnType<typeof createApiClient>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Hydrate from localStorage on mount
  useEffect(() => {
    try {
      const storedToken = localStorage.getItem('auth_token');
      const storedUser = localStorage.getItem('auth_user');

      if (storedToken && storedUser) {
        const parsed = JSON.parse(storedUser);
        setToken(storedToken);
        setUser(parsed);
      }
    } catch {
      // Invalid stored data — clear it
      localStorage.removeItem('auth_token');
      localStorage.removeItem('auth_user');
    } finally {
      setLoading(false);
    }
  }, []);

  const login = useCallback((newToken: string, newUser: AuthUser) => {
    localStorage.setItem('auth_token', newToken);
    localStorage.setItem('auth_user', JSON.stringify(newUser));
    localStorage.setItem('householdId', newUser.householdId);
    setToken(newToken);
    setUser(newUser);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
    localStorage.removeItem('householdId');
    setToken(null);
    setUser(null);
  }, []);

  // Authenticated API client — injects Bearer token automatically
  const apiClient = useMemo(() => {
    const authFetch: typeof fetch = (input, init) => {
      const headers: Record<string, string> = {
        ...(init?.headers as Record<string, string> || {}),
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      return fetch(input, { ...init, headers });
    };
    return createApiClient(API_URL, authFetch);
  }, [token]);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    token,
    householdId: user?.householdId ?? null,
    isLoggedIn: !!token && !!user,
    loading,
    login,
    logout,
    apiClient,
  }), [user, token, loading, login, logout, apiClient]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
