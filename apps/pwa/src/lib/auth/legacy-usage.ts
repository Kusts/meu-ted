/**
 * Telemetria LOCAL de uso do fallback legado (V4 T2.2 B2, ADR-015).
 *
 * Apenas contadores por canal (`session` = bearer de sessão do localStorage,
 * `device` = device token do localStorage) — NUNCA valores de credencial,
 * tokens, cookies ou headers. A medição autoritativa de uso efetivo vive no
 * servidor (`auth.request.legacy_bearer_used`, T0.4.1); este contador local
 * existe para diagnóstico client-side e fecha com a janela de compatibilidade
 * (review 2026-12-01, mesma janela do `NEXT_PUBLIC_LEGACY_BEARER_COMPAT`).
 *
 * Hierarquia de telemetria (T2.3 B3.4): o client-side NÃO sabe se o cookie
 * HttpOnly autenticou a request — ele conta 'bearer anexado' (o fallback foi
 * colocado no wire) como proxy local. A verdade sobre "o bearer foi o
 * autenticador efetivo" vive SÓ no servidor, que resolve a sessão com e sem
 * o header (sonda fail-closed em `routes/index.ts`) e emite
 * `auth.request.legacy_bearer_used` somente quando o cookie sozinho NÃO
 * autenticaria. Decisão de remoção (ADR-015, limiar/janela) usa o emissor
 * API-side; este contador local serve apenas para diagnóstico e tende a
 * supercontar (anexo ≠ efetivo). Com a flag compat off, nada é anexado e
 * nada é contado aqui (zero reads/writes).
 */

export const LEGACY_USAGE_STORAGE_KEY = "pi-finance:legacy-usage";

export type LegacyAuthChannel = "session" | "device";

export interface LegacyAuthUsage {
  session: number;
  device: number;
}

const ZERO: LegacyAuthUsage = { session: 0, device: 0 };

function getStorage(): Storage | null {
  if (typeof window !== "undefined" && window.localStorage) return window.localStorage;
  if (typeof globalThis !== "undefined" && (globalThis as { localStorage?: Storage }).localStorage) {
    return (globalThis as { localStorage?: Storage }).localStorage ?? null;
  }
  return null;
}

function toCount(value: unknown): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

export function getLegacyAuthUsage(): LegacyAuthUsage {
  try {
    const raw = getStorage()?.getItem(LEGACY_USAGE_STORAGE_KEY);
    if (!raw) return { ...ZERO };
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return { ...ZERO };
    const record = parsed as Record<string, unknown>;
    return { session: toCount(record["session"]), device: toCount(record["device"]) };
  } catch {
    return { ...ZERO };
  }
}

/** Incrementa o contador do canal. Desconhecido = ignorado (fail-closed). */
export function noteLegacyAuthUsage(channel: LegacyAuthChannel): void {
  if (channel !== "session" && channel !== "device") return;
  try {
    const current = getLegacyAuthUsage();
    const next: LegacyAuthUsage = { ...current, [channel]: current[channel] + 1 };
    getStorage()?.setItem(LEGACY_USAGE_STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* telemetria nunca quebra o fluxo principal */
  }
}

export function clearLegacyAuthUsage(): void {
  try {
    getStorage()?.removeItem(LEGACY_USAGE_STORAGE_KEY);
  } catch {
    /* noop */
  }
}
