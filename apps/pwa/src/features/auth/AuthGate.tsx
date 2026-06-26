"use client";

import { useState, useEffect, useCallback } from "react";
import { getToken, setToken } from "@/lib/auth/token-store";
import {
  isPinSet,
  hashPin,
  verifyPin,
} from "@/lib/auth/pin-store";
import { apiGet, apiPost, ApiError } from "@/lib/api/client";
import { resetLocalSession } from "@/lib/reset-session";

type AuthState = "loading" | "register" | "setup-pin" | "unlock" | "unlocked";

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
          resetLocalSession();
          setError("Sessão antiga expirada. Registre o dispositivo novamente.");
          setState("register");
          return;
        }
      }

      if (!isPinSet()) {
        setState("setup-pin");
      } else {
        setState("unlock");
      }
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
      resetLocalSession();
      setToken(res.token);
      setState("setup-pin");
    } catch (e: unknown) {
      setError(
        e instanceof ApiError ? e.message : "Falha ao registrar dispositivo.",
      );
    }
  }, []);

  const handleSetPin = useCallback(async (pin: string) => {
    await hashPin(pin);
    setState("unlocked");
  }, []);

  const handleUnlock = useCallback(async (pin: string) => {
    const ok = await verifyPin(pin);
    if (ok) {
      setState("unlocked");
      setError("");
    } else {
      setError("PIN incorreto");
    }
  }, []);

  const handleReset = useCallback(() => {
    resetLocalSession();
    setState("register");
    setError("Sessão limpa. Registre o dispositivo novamente.");
  }, []);

  if (state === "unlocked") return <>{children}</>;
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
      {state === "setup-pin" && <SetupPin onSubmit={handleSetPin} />}
      {state === "unlock" && (
        <UnlockPin
          onSubmit={handleUnlock}
          onReset={handleReset}
          error={error}
          setError={setError}
        />
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

function SetupPin({ onSubmit }: { onSubmit: (pin: string) => void }) {
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [step, setStep] = useState<"create" | "confirm">("create");
  const [error, setError] = useState("");

  return (
    <div className="w-full max-w-sm space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-xl font-bold text-text-primary">
          {step === "create" ? "Crie seu PIN" : "Confirme o PIN"}
        </h1>
        <p className="text-sm text-text-secondary">
          Use este PIN para acessar o app.
        </p>
      </div>
      <PinInput
        value={step === "create" ? pin : confirm}
        onChange={step === "create" ? setPin : setConfirm}
      />
      {error && (
        <p className="text-center text-sm text-danger">{error}</p>
      )}
      {step === "create" ? (
        <button
          onClick={() => {
            if (pin.length < 4) setError("PIN deve ter 4+ dígitos");
            else {
              setError("");
              setStep("confirm");
            }
          }}
          disabled={pin.length < 4}
          className="w-full rounded-xl bg-primary py-3 font-semibold text-white transition disabled:opacity-50"
        >
          Próximo
        </button>
      ) : (
        <button
          onClick={() => {
            if (pin !== confirm) setError("PINs não conferem");
            else onSubmit(pin);
          }}
          disabled={confirm.length < 4}
          className="w-full rounded-xl bg-primary py-3 font-semibold text-white transition disabled:opacity-50"
        >
          Salvar PIN
        </button>
      )}
    </div>
  );
}

function UnlockPin({
  onSubmit,
  onReset,
  error,
  setError,
}: {
  onSubmit: (pin: string) => void;
  onReset: () => void;
  error: string;
  setError: (e: string) => void;
}) {
  const [pin, setPin] = useState("");
  const handleEnter = async () => {
    if (pin.length < 4) return;
    await onSubmit(pin);
    setPin("");
  };
  return (
    <div className="w-full max-w-sm space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-xl font-bold text-text-primary">Pi Financeiro</h1>
        <p className="text-sm text-text-secondary">Digite seu PIN.</p>
      </div>
      <PinInput value={pin} onChange={setPin} />
      {error && (
        <p className="text-center text-sm text-danger">{error}</p>
      )}
      <button
        onClick={handleEnter}
        disabled={pin.length < 4}
        className="w-full rounded-xl bg-primary py-3 font-semibold text-white transition active:scale-[0.98] disabled:opacity-50"
      >
        Entrar
      </button>
      <button
        onClick={() => {
          onReset();
          setError("");
        }}
        className="w-full text-sm text-text-secondary transition"
      >
        Trocar dispositivo / limpar sessão
      </button>
    </div>
  );
}

// ─── PinInput ───────────────────────────────────────────────────────────────

function PinInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const dots = [0, 1, 2, 3];
  const key = (n: number) => {
    if (value.length >= 4) return;
    onChange(value + n);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-center gap-4">
        {dots.map((i) => (
          <div
            key={i}
            className="h-4 w-4 rounded-full border-2 transition"
            style={{
              background:
                i < value.length
                  ? "var(--color-primary)"
                  : "transparent",
              borderColor:
                i < value.length
                  ? "var(--color-primary)"
                  : "var(--color-border)",
            }}
          />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-3">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
          <button
            key={n}
            onClick={() => key(n)}
            className="rounded-xl border border-border bg-surface py-4 text-2xl font-medium text-text-primary transition active:opacity-80"
          >
            {n}
          </button>
        ))}
        <div />
        <button
          onClick={() => key(0)}
          className="rounded-xl border border-border bg-surface py-4 text-2xl font-medium text-text-primary transition active:opacity-80"
        >
          0
        </button>
        <button
          onClick={() => onChange(value.slice(0, -1))}
          className="rounded-xl border border-border bg-surface py-4 text-lg text-text-secondary transition active:opacity-80"
        >
          ⌫
        </button>
      </div>
    </div>
  );
}
