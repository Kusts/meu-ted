/**
 * Offline identity (V4.1 Closure Phase 3, AUTH-02 / INV-03 / INV-04).
 *
 * Non-authenticator identifiers persisted ONLY after a server-confirmed
 * online authentication (callers bind from the session probe identity —
 * `session.user` — never from a bearer, device secret, or cookie value):
 *
 * ```text
 * offlinePrincipalId = authenticated user identity (opaque, non-secret)
 * offlineWorkspaceId = active workspace UUID (opaque, non-secret)
 * ownerKey           = "v3" + principal + workspace (the V3 snapshot key)
 * ```
 *
 * These identifiers grant nothing: they never reach the API, never act as
 * a bearer, and never authenticate. They only partition the offline
 * snapshot cache (INV-04: user A / workspace X is unreadable as B or Y).
 * Removed on logout/revocation; rebound (workspace side) on workspace
 * switch (AUTH-T06/T07).
 */

export const OFFLINE_PRINCIPAL_STORAGE_KEY = "pi-finance:offline-principal";
export const OFFLINE_WORKSPACE_STORAGE_KEY = "pi-finance:offline-workspace";

import { clearOfflineSubjectId } from "@/lib/auth/offline-subject";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function getStorage(): Storage | null {
  if (typeof window !== "undefined" && window.localStorage) return window.localStorage;
  if (typeof globalThis !== "undefined" && (globalThis as { localStorage?: Storage }).localStorage) {
    return (globalThis as { localStorage?: Storage }).localStorage ?? null;
  }
  return null;
}

function isPrincipalId(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isWorkspaceId(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value.trim());
}

/** Public validator: workspace bindings accept UUIDs only. */
export function isOfflineWorkspaceId(value: unknown): value is string {
  return isWorkspaceId(value);
}

/** Authenticated user identity bound for offline partitioning; null when absent. */
export function getOfflinePrincipalId(): string | null {
  try {
    const raw = getStorage()?.getItem(OFFLINE_PRINCIPAL_STORAGE_KEY);
    return isPrincipalId(raw) ? (raw as string) : null;
  } catch {
    return null;
  }
}

/**
 * Persist the server-confirmed user identity. Fail-closed: empty values are
 * refused without writing. Call ONLY after a valid online authentication.
 */
export function setOfflinePrincipalId(principalId: string): boolean {
  if (!isPrincipalId(principalId)) return false;
  try {
    getStorage()?.setItem(OFFLINE_PRINCIPAL_STORAGE_KEY, principalId);
    return true;
  } catch {
    return false;
  }
}

/** Active workspace bound for offline partitioning; null when absent/invalid. */
export function getOfflineWorkspaceId(): string | null {
  try {
    const raw = getStorage()?.getItem(OFFLINE_WORKSPACE_STORAGE_KEY);
    return isWorkspaceId(raw) ? (raw as string) : null;
  } catch {
    return null;
  }
}

/**
 * Persist the active workspace binding. Accepts ONLY UUIDs (fail-closed).
 * Called from the workspace choke point after valid auth — never from a
 * credential.
 */
export function setOfflineWorkspaceId(workspaceId: string): boolean {
  if (!isWorkspaceId(workspaceId)) return false;
  try {
    getStorage()?.setItem(OFFLINE_WORKSPACE_STORAGE_KEY, workspaceId);
    return true;
  } catch {
    return false;
  }
}

/**
 * Bind both sides of the offline identity at once. Returns true only when
 * both persisted. Call ONLY after a valid online authentication.
 */
export function bindOfflineIdentity(principalId: string, workspaceId: string): boolean {
  if (!isPrincipalId(principalId) || !isWorkspaceId(workspaceId)) return false;
  const principalOk = setOfflinePrincipalId(principalId);
  const workspaceOk = setOfflineWorkspaceId(workspaceId);
  return principalOk && workspaceOk;
}

/**
 * Logical V3 owner key: version + principal + workspace. Plain
 * concatenation is sufficient — both parts are opaque non-secrets, and the
 * key must be computable synchronously on every read. (SPEC AUTH-02
 * permits a SHA-256 derivation instead; raw parts are equally non-secret.)
 */
export function computeOwnerKey(principalId: string, workspaceId: string): string {
  return `v3:${principalId}:${workspaceId}`;
}

/**
 * Full identity teardown (logout / 401 / 403 revocation — AUTH-T04/05/06):
 * principal + workspace binding + subject partition. The age stamp and
 * snapshots are cleared by the caller's session cleanup alongside this.
 */
export function clearOfflineIdentity(): void {
  try {
    getStorage()?.removeItem(OFFLINE_PRINCIPAL_STORAGE_KEY);
  } catch {
    /* noop */
  }
  clearOfflineWorkspaceBinding();
}

/**
 * Workspace-side teardown (workspace switch — AUTH-T07): the workspace
 * binding + subject partition are cleared while the user principal
 * survives for rebinding. The caller also purges the snapshot and the age
 * stamp so workspace X data can never appear as workspace Y.
 */
export function clearOfflineWorkspaceBinding(): void {
  try {
    getStorage()?.removeItem(OFFLINE_WORKSPACE_STORAGE_KEY);
  } catch {
    /* noop */
  }
  try {
    clearOfflineSubjectId();
  } catch {
    /* noop */
  }
}
