"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import { getToken, clearToken, setToken, setSessionToken } from "@/lib/auth/token-store";
import { ApiError, clearActiveWorkspaceId } from "@/lib/api/client";
import { signInWithEmail, registerDeviceToken, verifyDeviceToken, fetchSession, type SessionUser, type SessionProbeStatus } from "@/lib/api/auth";
import { clearSensitiveSession } from "@/lib/session";
import { SessionProvider, type SessionSnapshot } from "@/lib/auth/session-context";
import { setSessionStatus } from "@/lib/auth/session-authority";
import {
  setOfflinePrincipalId,
  getOfflinePrincipalId,
  getOfflineWorkspaceId,
} from "@/lib/auth/offline-identity";
import { resolveUnreachableOfflineRoute } from "@/lib/state/snapshot-db";
import { Lock, Mail, ArrowRight } from "lucide-react";
import { Splash } from "@/components/Splash";

type AuthState = "loading" | "login" | "unlocked";

interface Props {
  children: React.ReactNode;
}

export function AuthGate({ children }: Props) {
  const [state, setState] = useState<AuthState>("loading");
  const [error, setError] = useState("");
  // V4.1 Closure AUTH-01: explicit session authority mirrored from the
  // probe. Written to the module store synchronously BEFORE unlocking so
  // AppStateProvider (mounted as a child) boots with the right authority.
  const [session, setSessionValue] = useState<SessionSnapshot>({ status: "unknown" });
  const publishSession = useCallback((next: SessionSnapshot) => {
    setSessionStatus(next);
    setSessionValue(next);
  }, []);
  // Phase 3 (AUTH-02): persist the server-confirmed user identity for
  // offline partitioning. Non-secret, non-authenticator — never a bearer,
  // device secret, or cookie value. Best-effort, never blocks the boot.
  const bindPrincipal = useCallback((user: { id: string }) => {
    try {
      setOfflinePrincipalId(user.id);
    } catch {
      /* noop */
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      // FIX-FINAL-2 FINDING 1 (ADR-015 cookie-first) + V4.1 Closure AUTH-04:
      // the boot ALWAYS probes the cookie session first (GET /auth/session).
      // The probe distinguishes authenticated / unauthenticated (401/403,
      // 2xx-without-user) / unreachable (network — NEVER logout). A stored
      // device token is scoped (registration/verification/rotation) and
      // never decides the session alone — an invalid device token (401)
      // drops ONLY the device token; the cookie session is never cleared
      // on this path.
      let sessionUser: SessionUser | null = null;
      let probeStatus: SessionProbeStatus = "unreachable";
      try {
        const session = await fetchSession();
        sessionUser = session?.user ?? null;
        probeStatus = session?.status ?? (sessionUser ? "authenticated" : "unauthenticated");
      } catch {
        sessionUser = null;
        probeStatus = "unreachable";
      }

      const token = getToken();
      if (!token) {
        // T2.5 (ADR-015 Opção C, session-first): the boot MUST NOT depend on
        // the device token. Without one, a valid cookie session is enough to
        // operate — GET /auth/session is the scoped session check.
        // Fail-closed: unauthenticated means login. Unreachable means the
        // server never answered: record it as unreachable (NOT a logout —
        // nothing is purged). Phase 3 (AUTH-T03) routes it through the V3
        // snapshot below — valid + within TTL unlocks offline read-only,
        // otherwise the login screen. The distinction survives in the
        // session authority instead of collapsing into login-state.
        if (probeStatus === "authenticated" && sessionUser) {
          bindPrincipal(sessionUser);
          publishSession({
            status: "authenticated",
            user: { userId: sessionUser.id, email: sessionUser.email, name: sessionUser.name },
          });
          if (!cancelled) setState("unlocked");
        } else if (probeStatus === "unreachable") {
          // Phase 3 (AUTH-03/AUTH-04): unreachability is not a rejection —
          // never purge here. Consult the V3 snapshot: a valid,
          // within-TTL envelope for the last bound identity unlocks offline
          // read-only; otherwise the login screen (no false logout).
          let offline = false;
          try {
            const route = await resolveUnreachableOfflineRoute(
              getOfflinePrincipalId(),
              getOfflineWorkspaceId(),
            );
            offline = route === "offline-read-only";
          } catch {
            offline = false;
          }
          if (cancelled) return;
          if (offline) {
            publishSession({
              status: "unreachable",
              offlinePrincipalId: getOfflinePrincipalId() ?? undefined,
            });
            setState("unlocked");
          } else {
            publishSession({ status: "unreachable" });
            setState("login");
          }
        } else {
          publishSession({ status: "unauthenticated" });
          if (!cancelled) setState("login");
        }
        return;
      }

      try {
        await verifyDeviceToken(token);
        // Compat path: a verified device token unlocks as before. It only
        // proves the session authority when the cookie probe agrees;
        // otherwise keep unknown so the legacy bearer fallback still
        // applies (compat ON behaviour untouched).
        if (sessionUser) {
          bindPrincipal(sessionUser);
          publishSession({
            status: "authenticated",
            user: { userId: sessionUser.id, email: sessionUser.email, name: sessionUser.name },
          });
        } else {
          publishSession({ status: "unknown" });
        }
        if (!cancelled) setState("unlocked");
      } catch (e) {
        if (cancelled) return;
        if (e instanceof ApiError && e.status === 401) {
          // Scoped device token expired/rotated/revoked: drop ONLY it. When
          // the cookie session is still valid the user stays unlocked; only
          // a missing session falls through to the fail-closed login below.
          try {
            clearToken();
          } catch {
            /* noop */
          }
          if (sessionUser) {
            bindPrincipal(sessionUser);
            publishSession({
              status: "authenticated",
              user: { userId: sessionUser.id, email: sessionUser.email, name: sessionUser.name },
            });
            if (!cancelled) setState("unlocked");
            return;
          }
          await clearSensitiveSession({
            clearToken: true,
            clearV1Snapshot: true,
            clearProfile: true,
            clearOfflineIdentity: true,
          }).catch(() => {});
          publishSession({ status: "unauthenticated" });
          if (!cancelled) {
            setError("Sessão antiga expirada. Faça login novamente.");
            setState("login");
          }
          return;
        }
        // If network error during verification but token is stored, unlock to allow offline capabilities
        publishSession({ status: "unreachable" });
        if (!cancelled) setState("unlocked");
      }
    };
    init();

    return () => {
      cancelled = true;
    };
  }, [publishSession, bindPrincipal]);

  const handleLogin = useCallback(async (credentials: { email: string; password: string }) => {
    setError("");
    clearActiveWorkspaceId();
    try {
      const signInRes = await signInWithEmail(credentials);
      const sessionToken = signInRes?.token;
      // T2.2 B2/B3 (ADR-015): escrita do bearer legado atrás da janela de
      // compat (NEXT_PUBLIC_LEGACY_BEARER_COMPAT, review 2026-12-01) dentro
      // da token-store — sem writes diretos em localStorage aqui. Com a
      // flag off, a sessão opera 100% via cookie HttpOnly.
      if (sessionToken) {
        setSessionToken(sessionToken);
      }

      const res = await registerDeviceToken(sessionToken);

      if (!res?.token) {
        throw new Error("Token de dispositivo não retornado pelo servidor.");
      }

      setToken(res.token);

      // Login succeeded server-side (sign-in + device register both 2xx):
      // that IS proof of authentication. Confirm identity via the probe;
      // fall back to the just-authenticated email (non-secret identity).
      try {
        const probe = await fetchSession();
        if (probe.user) {
          bindPrincipal(probe.user);
          publishSession({
            status: "authenticated",
            user: { userId: probe.user.id, email: probe.user.email, name: probe.user.name },
          });
        } else {
          bindPrincipal({ id: credentials.email });
          publishSession({
            status: "authenticated",
            user: { userId: credentials.email, email: credentials.email },
          });
        }
      } catch {
        bindPrincipal({ id: credentials.email });
        publishSession({
          status: "authenticated",
          user: { userId: credentials.email, email: credentials.email },
        });
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
  }, [bindPrincipal]);

  const expireSession = useCallback(async (message?: string) => {
    // 401/403: explicit server rejection → purge everything offline (V1/V2/V3
    // snapshots, tokens, profile, offline identity + stamp) + login. Never
    // offline mode on this path (AUTH-T04/T05, INV-05).
    await clearSensitiveSession({
      clearToken: true,
      clearV1Snapshot: true,
      clearProfile: true,
      clearOfflineIdentity: true,
    });
    // 401/403: explicit server rejection → unauthenticated (purge + login).
    publishSession({ status: "unauthenticated" });
    setError(message ?? "Sessão expirada. Faça login novamente.");
    setState("login");
  }, [publishSession]);

  if (state === "unlocked")
    return <SessionProvider value={{ expireSession, session }}>{children}</SessionProvider>;
  if (state === "loading") return <Splash />;

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
          <Image
            src="/logo.svg"
            alt="Meu Ted"
            width={48}
            height={48}
            priority
            className="mx-auto h-12 w-12 drop-shadow-[0_4px_18px_rgba(14,140,90,0.35)]"
          />
          <h1 className="text-[22px] font-bold tracking-tight text-text-primary">Meu Ted</h1>
          <p className="text-[13px] font-medium text-text-muted">
            tudo em dia.
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
                className="w-full rounded-[14px] border border-border-subtle bg-surface-2 py-3 pl-10 pr-3.5 text-[16px] font-medium text-text-primary outline-none focus:border-primary disabled:opacity-50 transition-colors"
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
                className="w-full rounded-[14px] border border-border-subtle bg-surface-2 py-3 pl-10 pr-3.5 text-[16px] font-medium text-text-primary outline-none focus:border-primary disabled:opacity-50 transition-colors"
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
