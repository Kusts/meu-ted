"use client";

import { useState, useEffect, useCallback } from "react";
import { getToken, setToken } from "@/lib/auth/token-store";
import { apiGet, apiPost, ApiError } from "@/lib/api/client";
import { clearSensitiveSession } from "@/lib/session";
import { SessionProvider } from "@/lib/auth/session-context";

type AuthState = "loading" | "login" | "unlocked";

interface Props {
  children: React.ReactNode;
}

export function AuthGate({ children }: Props) {
  const [state, setState] = useState<AuthState>("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      const token = getToken();
      if (!token) {
        if (!cancelled) setState("login");
        return;
      }

      try {
        await apiGet<unknown>("/auth/devices/me", token);
        if (!cancelled) setState("unlocked");
      } catch (e) {
        if (cancelled) return;
        if (e instanceof ApiError && e.status === 401) {
          await clearSensitiveSession({
            clearToken: true,
            clearV1Snapshot: true,
            clearProfile: true,
          });
          setError("Sessão antiga expirada. Faça login novamente.");
          setState("login");
          return;
        }
        // If network error during verification but token is stored, unlock to allow offline capabilities
        setState("unlocked");
      }
    };
    init();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleLogin = useCallback(async (credentials: { email: string; password: string }) => {
    setError("");
    try {
      // 1. Sign in via Better-Auth endpoint
      await apiPost<{ user: unknown; session: unknown }>("/auth/sign-in/email", null, credentials);

      // 2. Register/obtain device token subordinated to the authenticated session
      const res = await apiPost<{
        token: string;
        deviceId: string;
        householdId: string;
      }>("/auth/devices/register", null, { deviceName: "PWA Web Device" });

      if (!res?.token) {
        throw new Error("Token de dispositivo não retornado pelo servidor.");
      }

      // 3. Persist the new device token synchronously into token-store / localStorage
      setToken(res.token);
      try {
        localStorage.setItem("pi-finance:token", res.token);
      } catch {
        /* noop */
      }

      // 4. Unlock the gate
      setState("unlocked");
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        if (e.status === 401 || e.status === 400) {
          setError("E-mail ou senha incorretos.");
        } else {
          setError(e.message || "Falha na autenticação.");
        }
      } else if (e instanceof Error) {
        setError(e.message || "Falha ao realizar login.");
      } else {
        setError("Falha ao realizar login.");
      }
      throw e;
    }
  }, []);

  const expireSession = useCallback(async (message?: string) => {
    // Async: cleanup completes BEFORE UI state transition.
    await clearSensitiveSession({
      clearToken: true,
      clearV1Snapshot: true,
      clearProfile: true,
    });
    setError(message ?? "Sessão expirada. Faça login novamente.");
    setState("login");
  }, []);

  if (state === "unlocked")
    return <SessionProvider value={{ expireSession }}>{children}</SessionProvider>;
  if (state === "loading")
    return (
      <main className="flex h-dvh items-center justify-center text-text-secondary">
        Carregando…
      </main>
    );

  return (
    <main className="flex min-h-dvh items-center justify-center bg-bg p-6">
      {state === "login" && (
        <LoginForm onSubmit={handleLogin} error={error} />
      )}
    </main>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function LoginForm({
  onSubmit,
  error,
}: {
  onSubmit: (credentials: { email: string; password: string }) => Promise<void> | void;
  error: string;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e?: React.FormEvent | React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (!email.trim() || !password.trim() || submitting) return;
    setSubmitting(true);
    try {
      await onSubmit({ email: email.trim(), password: password.trim() });
    } catch {
      // Errors handled in AuthGate state
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      action="#"
      method="post"
      onSubmit={handleSubmit}
      noValidate
      className="w-full max-w-sm space-y-6"
    >
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-bold text-text-primary">Pi Financeiro</h1>
        <p className="text-sm text-text-secondary">
          Acesse com seu e-mail e senha.
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-xs font-medium text-text-secondary mb-1">
            E-mail
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                e.stopPropagation();
                void handleSubmit(e);
              }
            }}
            placeholder="seu.email@exemplo.com"
            autoComplete="email"
            autoFocus
            required
            disabled={submitting}
            className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm text-text-primary outline-none focus:border-primary disabled:opacity-50"
          />
        </div>

        <div>
          <label htmlFor="password" className="block text-xs font-medium text-text-secondary mb-1">
            Senha
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                e.stopPropagation();
                void handleSubmit(e);
              }
            }}
            placeholder="••••••••"
            autoComplete="current-password"
            required
            disabled={submitting}
            className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm text-text-primary outline-none focus:border-primary disabled:opacity-50"
          />
        </div>
      </div>

      {error && (
        <p className="text-center text-sm text-danger" role="alert">{error}</p>
      )}

      <button
        type="submit"
        disabled={!email.trim() || !password.trim() || submitting}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          void handleSubmit(e);
        }}
        className="w-full rounded-xl bg-primary py-3 font-semibold text-white transition active:scale-[0.98] disabled:opacity-50"
      >
        {submitting ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}

