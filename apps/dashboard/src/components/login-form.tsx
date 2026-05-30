'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Login Form Component
// Shows when user is not logged in
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react';

interface LoginFormProps {
  apiUrl: string;
  onSuccess: (token: string, user: { id: string; name: string; phone: string }) => void;
}

export function LoginForm({ apiUrl, onSuccess }: LoginFormProps) {
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleRequestCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = await fetch(`${apiUrl}/auth/request-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        setError(data.reason || 'Erro ao enviar código');
        return;
      }

      setStep('code');
    } catch {
      setError('Erro de conexão');
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = await fetch(`${apiUrl}/auth/verify-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, code }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        setError(data.reason || 'Código inválido');
        return;
      }

      // Save token to localStorage
      localStorage.setItem('auth_token', data.token);
      localStorage.setItem('auth_user', JSON.stringify(data.user));

      onSuccess(data.token, data.user);
    } catch {
      setError('Erro de conexão');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-container">
      <div className="login-card">
        <h1 className="login-title">TED Finance</h1>
        <p className="login-subtitle">Entrar com WhatsApp</p>

        {error && (
          <div className="login-error">
            {error}
          </div>
        )}

        {step === 'phone' ? (
          <form onSubmit={handleRequestCode} className="login-form">
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Telefone (ex: 5511999999999)"
              className="login-input"
              required
            />
            <button type="submit" className="login-button" disabled={loading}>
              {loading ? 'Enviando...' : 'Enviar código'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyCode} className="login-form">
            <p className="code-sent">Código enviado para {phone}</p>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="Código de 6 dígitos"
              className="login-input code-input"
              maxLength={6}
              required
              autoFocus
            />
            <button type="submit" className="login-button" disabled={loading || code.length !== 6}>
              {loading ? 'Verificando...' : 'Entrar'}
            </button>
            <button
              type="button"
              className="back-button"
              onClick={() => {
                setStep('phone');
                setCode('');
                setError(null);
              }}
            >
              Voltar
            </button>
          </form>
        )}
      </div>

      <style jsx>{`
        .login-container {
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          background: var(--bg-primary);
          padding: 1rem;
        }

        .login-card {
          background: var(--bg-secondary);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 2rem;
          width: 100%;
          max-width: 360px;
        }

        .login-title {
          font-size: 1.5rem;
          font-weight: 600;
          color: var(--accent-green);
          text-align: center;
          margin: 0 0 0.5rem;
        }

        .login-subtitle {
          font-size: 0.875rem;
          color: var(--text-secondary);
          text-align: center;
          margin: 0 0 1.5rem;
        }

        .login-form {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .login-input {
          padding: 0.75rem 1rem;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: var(--bg-primary);
          color: var(--text-primary);
          font-size: 1rem;
        }

        .code-input {
          text-align: center;
          font-size: 1.5rem;
          letter-spacing: 0.25rem;
        }

        .login-button {
          padding: 0.75rem 1rem;
          background: var(--accent-green);
          color: var(--bg-primary);
          border: none;
          border-radius: 8px;
          font-size: 1rem;
          font-weight: 500;
          cursor: pointer;
        }

        .login-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .back-button {
          padding: 0.5rem;
          background: transparent;
          color: var(--text-secondary);
          border: none;
          font-size: 0.875rem;
          cursor: pointer;
        }

        .code-sent {
          font-size: 0.875rem;
          color: var(--text-secondary);
          text-align: center;
        }

        .login-error {
          padding: 0.75rem;
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.3);
          border-radius: 8px;
          color: #ef4444;
          font-size: 0.875rem;
          text-align: center;
          margin-bottom: 1rem;
        }
      `}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Auth Hook
// Manages login state
// ─────────────────────────────────────────────────────────────────────────────

export function useAuth() {
  function getToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('auth_token');
  }

  function getUser(): { id: string; name: string; phone: string } | null {
    if (typeof window === 'undefined') return null;
    const userStr = localStorage.getItem('auth_user');
    if (!userStr) return null;
    try {
      return JSON.parse(userStr);
    } catch {
      return null;
    }
  }

  function logout(): void {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
  }

  function isLoggedIn(): boolean {
    return !!getToken();
  }

  return { getToken, getUser, logout, isLoggedIn };
}