/**
 * Worker alias → canonical resolver via authoritative API endpoint.
 * Single semantics: the API/DB is the source of truth. No in-memory hardcode.
 * For tests, mock this module via vi.mock to return the expected canonical.
 */
export const resolveCanonicalHouseholdId = async (
  apiOrigin: string,
  serviceToken: string,
  workspaceId: string,
): Promise<string> => {
  if (!workspaceId) return workspaceId;
  try {
    const url = `${apiOrigin.replace(/\/$/, '')}/internal/workspace-alias/${encodeURIComponent(workspaceId)}`;
    const res = await fetch(url, {
      headers: { 'x-agent-service-token': serviceToken },
    });
    if (res.ok) {
      const data = (await res.json()) as { canonicalHouseholdId?: string; householdId?: string };
      const canonical = data.canonicalHouseholdId ?? data.householdId;
      if (canonical) return String(canonical);
    }
  } catch {
    // fall through
  }
  return workspaceId;
};
