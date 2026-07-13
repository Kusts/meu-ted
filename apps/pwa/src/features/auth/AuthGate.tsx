"use client";

import { useState, useEffect, useCallback } from "react";
import { getToken, setToken } from "@/lib/auth/token-store";
import { apiGet, apiPost, ApiError } from "@/lib/api/client";
import { clearSensitiveSession } from "@/lib/session";
import { SessionProvider } from "@/lib/auth/session-context";

type AuthState = "loading" | "register" | "unlocked";

interface Props {
  children: React.ReactNode;
}

export function AuthGate({ children }: Props) {
  const [state, setState] = useState<AuthState>("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    const init = async () => {
      const token = getToken();
      if (!token) {
        setState("register");
        return;
      }

      try {
        await apiGet<unknown>("/auth/devices/me", token);
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) {
          clearSensitiveSession({
            clearToken: true,
            clearV1Snapshot: true,
            clearProfile: true,
          });
          setError("Sessão antiga expirada. Registre o dispositivo novamente.");
          setState("register");
          return;
        }
      }

      setState("unlocked");
    };
    init();
  }, []);

  const handleRegister = useCallback(async (deviceName: string) => {
    setError("");
    try {
      const res = await apiPost<{
        token: string;
        deviceId: string;
        householdId: string;
      }>("/auth/devices/register", null, { deviceName });
      clearSensitiveSession({
        clearToken: true,
        clearV1Snapshot: true,
        clearProfile: true,
      });
      setToken(res.token);
      setState("unlocked");
    } catch (e: unknown) {
      setError(
        e instanceof ApiError ? e.message : "Falha ao registrar dispositivo.",
      );
    }
  }, []);

  const expireSession = useCallback((message?: string) => {
    // Synchronous cleanup completes BEFORE UI state transition.
    // clearSensitiveSession has no async operations (all localStorage + callbacks).
    clearSensitiveSession({
      clearToken: true,
      clearV1Snapshot: true,
      clearProfile: true,
    });
    setError(message ?? "Sessão expirada. Registre o dispositivo novamente.");
    setState("register");
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
      {state === "register" && (
        <RegisterDevice onSubmit={handleRegister} error={error} />
      )}
    </main>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function RegisterDevice({
  onSubmit,
  error,
}: {
  onSubmit: (name: string) => void;
  error: string;
}) {
  const [name, setName] = useState("Meu dispositivo");
  return (
    <div className="w-full max-w-sm space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-bold text-text-primary">Pi Financeiro</h1>
        <p className="text-sm text-text-secondary">
          Registre seu dispositivo.
        </p>
      </div>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Nome do dispositivo"
        autoFocus
        className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm text-text-primary"
      />
      {error && (
        <p className="text-center text-sm text-danger">{error}</p>
      )}
      <button
        onClick={() => onSubmit(name.trim())}
        disabled={!name.trim()}
        className="w-full rounded-xl bg-primary py-3 font-semibold text-white transition active:scale-[0.98] disabled:opacity-50"
      >
        Registrar
      </button>
    </div>
  );
}

