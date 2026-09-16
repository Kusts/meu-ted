/**
 * offlineSubjectId (V4 T2.2 B4 / D-V4-11, ADR-015).
 *
 * Identidade offline = id do workspace/household ATIVO: UUID estável, opaco,
 * NÃO-autenticador, NÃO derivado de credencial alguma. O snapshot offline
 * particiona por este id (nunca por credencial); a escrita acontece no
 * momento em que o workspace ativo é definido após auth válida
 * (`setActiveWorkspaceId` em `@/lib/api/client`).
 *
 * Persistência local simples (localStorage, chave dedicada). Sobrevive a
 * reload por construção (nada vive só em memória).
 */

export const OFFLINE_SUBJECT_STORAGE_KEY = "pi-finance:offline-subject";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function getStorage(): Storage | null {
  if (typeof window !== "undefined" && window.localStorage) return window.localStorage;
  if (typeof globalThis !== "undefined" && (globalThis as { localStorage?: Storage }).localStorage) {
    return (globalThis as { localStorage?: Storage }).localStorage ?? null;
  }
  return null;
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value.trim());
}

/** Lê o subject persistido; retorna null quando ausente ou inválido. */
export function getOfflineSubjectId(): string | null {
  try {
    const raw = getStorage()?.getItem(OFFLINE_SUBJECT_STORAGE_KEY);
    return isUuid(raw) ? (raw as string) : null;
  } catch {
    return null;
  }
}

/**
 * Persiste o id do workspace ativo. Aceita SOMENTE UUID (fail-closed:
 * qualquer outro valor é recusado sem escrever). Retorna se persistiu.
 */
export function setOfflineSubjectId(workspaceId: string): boolean {
  if (!isUuid(workspaceId)) return false;
  try {
    getStorage()?.setItem(OFFLINE_SUBJECT_STORAGE_KEY, workspaceId);
    return true;
  } catch {
    return false;
  }
}

export function clearOfflineSubjectId(): void {
  try {
    getStorage()?.removeItem(OFFLINE_SUBJECT_STORAGE_KEY);
  } catch {
    /* noop */
  }
}
