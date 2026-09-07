/**
 * Worker alias → canonical resolver via authoritative API endpoint.
 * Single semantics: the API/DB is the source of truth. No in-memory hardcode.
 *
 * C-02 fail-closed: any resolution failure (network error, non-OK status,
 * missing canonical id) THROWS — callers must deny (503/401), never fall
 * back to the received alias. For tests, mock this module via vi.mock.
 */
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
