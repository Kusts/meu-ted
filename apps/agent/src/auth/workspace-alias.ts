/**
 * Worker alias → canonical resolver via authoritative API endpoint.
 * Single semantics: the API/DB is the source of truth. No in-memory hardcode.
 *
 * C-02 fail-closed: any resolution failure (network error, non-OK status,
 * missing canonical id) THROWS — callers must deny (503/401), never fall
 * back to the received alias. For tests, mock this module via vi.mock.
 */
/**
 * C-05: canonical gate for every Durable Object name. When the caller can
 * reach the authority (service token configured), the received id — which
 * may be a raw alias — MUST resolve to the canonical household id before
 * any `idFromName` or any persistent key is derived from it. Any resolution
 * failure THROWS (fail-closed: the caller denies, never falls back to the
 * alias). Without a service token the caller cannot consult the authority;
 * the id is returned unresolved and the caller MUST treat it as
 * legacy/degraded (documented in docs/ops/do-canonical-namespace.md).
 */
export const requireCanonicalWorkspaceId = async (
  apiOrigin: string,
  serviceToken: string | undefined,
  workspaceId: string,
): Promise<{ canonical: string; resolved: boolean }> => {
  if (!workspaceId) return { canonical: workspaceId, resolved: false };
  if (!serviceToken || !serviceToken.trim()) return { canonical: workspaceId, resolved: false };
  const canonical = await resolveCanonicalHouseholdId(apiOrigin, serviceToken, workspaceId);
  return { canonical, resolved: true };
};

export const resolveCanonicalHouseholdId = async (
  apiOrigin: string,
  serviceToken: string,
  workspaceId: string,
): Promise<string> => {
  if (!workspaceId) return workspaceId;
  let res: Response;
  try {
    const url = `${apiOrigin.replace(/\/$/, '')}/internal/workspace-alias/${encodeURIComponent(workspaceId)}`;
    res = await fetch(url, {
      headers: { 'x-agent-service-token': serviceToken },
    });
  } catch (err) {
    throw new Error(`workspace alias resolution failed: ${(err as Error)?.message ?? 'network error'}`);
  }
  if (!res.ok) {
    throw new Error(`workspace alias resolution failed: HTTP ${res.status}`);
  }
  let canonical: string | undefined;
  try {
    const data = (await res.json()) as { canonicalHouseholdId?: string; householdId?: string };
    canonical = data.canonicalHouseholdId ?? data.householdId;
  } catch {
    canonical = undefined;
  }
  if (!canonical || typeof canonical !== 'string' || !canonical.trim()) {
    throw new Error('workspace alias resolution failed: missing canonical id');
  }
  return canonical;
};
