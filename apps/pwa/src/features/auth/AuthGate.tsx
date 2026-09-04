"use client";

import { useState, useEffect, useCallback } from "react";
import { getToken, setToken, setSessionToken } from "@/lib/auth/token-store";
import { ApiError, clearActiveWorkspaceId } from "@/lib/api/client";
import { signInWithEmail, registerDeviceToken, verifyDeviceToken } from "@/lib/api/auth";
import { clearSensitiveSession } from "@/lib/session";
import { SessionProvider } from "@/lib/auth/session-context";
import { Lock, Mail, ArrowRight } from "lucide-react";

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
        await verifyDeviceToken(token);
        if (!cancelled) setState("unlocked");
      } catch (e) {
        if (cancelled) return;
        if (e instanceof ApiError && e.status === 401) {
          await clearSensitiveSession({
            clearToken: true,
            clearV1Snapshot: true,
            clearProfile: true,
          }).catch(() => {});
          if (!cancelled) {
            setError("Sessão antiga expirada. Faça login novamente.");
            setState("login");
          }
          return;
        }
        // If network error during verification but token is stored, unlock to allow offline capabilities
        if (!cancelled) setState("unlocked");
      }
    };
    init();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleLogin = useCallback(async (credentials: { email: string; password: string }) => {
    setError("");
    clearActiveWorkspaceId();
    try {
      const signInRes = await signInWithEmail(credentials);
      const sessionToken = signInRes?.token;
      if (sessionToken) {
        setSessionToken(sessionToken);
        try {
          localStorage.setItem("pi-finance:session-token", sessionToken);
        } catch {
          /* noop */
        }
      }

      const res = await registerDeviceToken(sessionToken);

      if (!res?.token) {
        throw new Error("Token de dispositivo não retornado pelo servidor.");
      }

      setToken(res.token);
      try {
        localStorage.setItem("pi-finance:token", res.token);
      } catch {
        /* noop */
      }

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
      <main className="flex h-dvh items-center justify-center bg-bg text-text-secondary">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-border-subtle border-t-primary" />
          <span className="text-[13px] font-semibold text-text-muted">Carregando…</span>
        </div>
      </main>
    );

  return (
    <main className="relative flex min-h-dvh items-center justify-center bg-bg p-5 sm:p-8">
      {/* Background Ambient Glow */}
      <div className="pointer-events-none absolute -top-24 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />

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
    <div className="relative w-full max-w-sm rounded-[24px] border border-border-subtle bg-surface-1 p-6 sm:p-8 shadow-card backdrop-blur-xl">
      <form
        action="#"
        method="post"
        onSubmit={handleSubmit}
        noValidate
        className="space-y-5"
      >
        <div className="text-center space-y-2">
          {/* Logo Badge */}
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-[16px] bg-gradient-to-br from-primary to-[#0A3A28] text-white shadow-fab">
            <span className="font-mono text-[22px] font-bold">π</span>
          </div>
          <h1 className="text-[22px] font-bold tracking-tight text-text-primary">Pi Financeiro</h1>
          <p className="text-[13px] font-medium text-text-muted">
            Acesse com seu e-mail e senha.
          </p>
        </div>

        <div className="space-y-3.5">
          <fieldset>
            <label htmlFor="email" className="block text-[11px] font-bold uppercase tracking-wider text-text-muted mb-1.5">
              E-mail
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted">
                <Mail size={16} />
              </span>
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
                className="w-full rounded-[14px] border border-border-subtle bg-surface-2 py-3 pl-10 pr-3.5 text-[14px] font-medium text-text-primary outline-none focus:border-primary disabled:opacity-50 transition-colors"
              />
            </div>
          </fieldset>

          <fieldset>
            <label htmlFor="password" className="block text-[11px] font-bold uppercase tracking-wider text-text-muted mb-1.5">
              Senha
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted">
                <Lock size={16} />
              </span>
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
                className="w-full rounded-[14px] border border-border-subtle bg-surface-2 py-3 pl-10 pr-3.5 text-[14px] font-medium text-text-primary outline-none focus:border-primary disabled:opacity-50 transition-colors"
              />
            </div>
          </fieldset>
        </div>

        {error && (
          <div className="rounded-[12px] bg-danger-tint px-3.5 py-2.5 text-center text-[12px] font-semibold text-danger" role="alert">
            ⚠ {error}
          </div>
        )}

        <button
          type="submit"
          disabled={!email.trim() || !password.trim() || submitting}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            void handleSubmit(e);
          }}
          className="flex items-center justify-center gap-2 w-full rounded-[14px] bg-primary py-3.5 text-[15px] font-bold text-white shadow-fab transition-all hover:bg-primary-hover active:scale-[0.98] disabled:opacity-50 cursor-pointer"
        >
          {submitting ? "Entrando…" : "Entrar"}
          {!submitting && <ArrowRight size={16} strokeWidth={2.4} />}
        </button>
      </form>
    </div>
  );
}
