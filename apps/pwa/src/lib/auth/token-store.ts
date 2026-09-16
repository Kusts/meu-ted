/**
 * Única abstração de armazenamento de sessão (V4 T2.2 B2).
 *
 * Todo write/leitura das chaves legadas (`pi-finance:token`,
 * `pi-finance:session-token`) passa por este módulo — AuthGate, convite e o
 * client HTTP delegam para cá (nenhum `localStorage.setItem` direto dessas
 * chaves fora daqui).
 *
 * Janela de compatibilidade (ADR-015 Opção C, B3): a ESCRITA fica atrás de
 * `NEXT_PUBLIC_LEGACY_BEARER_COMPAT` (default true = janela aberta; leitura
 * em call-time para `vi.stubEnv` nos testes). Com a flag off, nenhum bearer
 * legado é persistido — a sessão opera 100% via cookie HttpOnly
 * (`credentials: "include"` no client). Revisão/remoção: 2026-12-01
 * (janela ADR-011/T5.4).
 *
 * T2.3 (B3 passos 4–6, DECISÃO: flag única, sem sub-flag): a mesma flag
 * controla leitura+escrita juntas. Com a flag off, a LEITURA também é
 * removida — os getters retornam null mesmo com token órfão em localStorage
 * (XLT-02 endurecido: nenhuma leitura de credencial no caminho de
 * requisição) e `cleanupOrphanedLegacyTokens()` (chamado no boot via
 * RootProviders) apaga as duas chaves legadas. Com a flag on, coexistência
 * B3.1 preservada (lê e preserva).
 */

const PREFIX = "pi-finance:";

type EnvLike = Record<string, string | undefined>;

const COMPAT_OFF_VALUES = new Set(["0", "false", "no", "off"]);

/**
 * Janela de compat do bearer legado aberta? Default true. Leitura em
 * call-time (nunca snapshot de build) para permitir toggle em teste.
 */
export function isLegacyBearerCompatEnabled(env?: EnvLike): boolean {
  try {
    const source: EnvLike | undefined =
      env ?? (typeof process !== "undefined" ? (process.env as EnvLike) : undefined);
    const raw = source?.["NEXT_PUBLIC_LEGACY_BEARER_COMPAT"];
    if (raw === undefined) return true;
    return !COMPAT_OFF_VALUES.has(raw.trim().toLowerCase());
  } catch {
    return true;
  }
}

function getStorage(): Storage | null {
  if (typeof window !== "undefined" && window.localStorage) return window.localStorage;
  if (typeof globalThis !== "undefined" && globalThis.localStorage) return globalThis.localStorage;
  return null;
}

export function getToken(): string | null {
  // T2.3 B3.5: flag off => leitura removida (órfão ignorado, zero reads).
  if (!isLegacyBearerCompatEnabled()) return null;
  try {
    return getStorage()?.getItem(`${PREFIX}token`) ?? null;
  } catch {
    return null;
  }
}
export function setToken(token: string): void {
  // B3 coexistência: sem a janela de compat, o bearer legado não é persistido.
  if (!isLegacyBearerCompatEnabled()) return;
  try {
    getStorage()?.setItem(`${PREFIX}token`, token);
  } catch {
    /* noop */
  }
}
export function clearToken(): void {
  try {
    getStorage()?.removeItem(`${PREFIX}token`);
  } catch {
    /* noop */
  }
}

const SESSION_PREFIX = "pi-finance:session-token";

export function getSessionToken(): string | null {
  // T2.3 B3.5: flag off => leitura removida (órfão ignorado, zero reads).
  if (!isLegacyBearerCompatEnabled()) return null;
  try {
    return getStorage()?.getItem(SESSION_PREFIX) ?? null;
  } catch {
    return null;
  }
}
export function setSessionToken(token: string): void {
  // B3 coexistência: sem a janela de compat, o bearer legado não é persistido.
  if (!isLegacyBearerCompatEnabled()) return;
  try {
    getStorage()?.setItem(SESSION_PREFIX, token);
  } catch {
    /* noop */
  }
}
export function clearSessionToken(): void {
  try {
    getStorage()?.removeItem(SESSION_PREFIX);
  } catch {
    /* noop */
  }
}

/**
 * T2.3 (B3 passo 4–6, caminho de limpeza do B2): remove os tokens órfãos
 * legados no boot quando a janela de compat está fechada. Com a flag on,
 * no-op (coexistência B3.1 — nunca apaga sessão ativa legada no meio da
 * janela). Chamado uma vez no boot via RootProviders.
 */
export function cleanupOrphanedLegacyTokens(): void {
  if (isLegacyBearerCompatEnabled()) return;
  clearToken();
  clearSessionToken();
}
