import type { FastifyInstance } from 'fastify';

/**
 * Canonical alias → household resolver using the authoritative persistent source.
 * PWA may send a synthetic X-Workspace-Id (invite id) that maps to the real
 * householdId. The single source of truth is the persistent DB (households +
 * invites). No in-memory hardcode or permissive fallback.
 * For contexts without a Pool (e.g., pure unit tests), the caller should
 * mock this module via vi.mock to provide the expected canonical for the
 * synthetic used in that test.
 */
export const resolveCanonicalHouseholdId = async (
  pool: { query: (text: string, values?: unknown[]) => Promise<{ rows: unknown[]; rowCount: number | null }> } | null | undefined,
  workspaceId: string,
): Promise<string> => {
  if (!workspaceId) return workspaceId;
  if (!pool || typeof pool.query !== 'function') return workspaceId;
  // 1) Direct household — if the id is a real household, it is already canonical
  try {
    const hh = await pool.query(`SELECT id FROM households WHERE id = $1 LIMIT 1`, [workspaceId]);
    if (hh.rowCount === 1) return workspaceId;
  } catch {
    // ignore and fall through to invite lookup
  }
  // 2) Invite alias — if the id is an invite, return its household_id
  try {
    const inv = await pool.query(`SELECT household_id FROM invites WHERE id = $1 LIMIT 1`, [workspaceId]);
    if (inv.rowCount === 1 && inv.rows[0]) {
      const row = inv.rows[0] as { household_id: string };
      if (row.household_id) return String(row.household_id);
    }
  } catch {
    // ignore
  }
  // 3) No alias found — return as-is for the caller to handle via workspaceAccess (will be 403 if not member)
  return workspaceId;
};

export const registerWorkspaceAliasRoutes = (
  app: FastifyInstance,
  deps: { pool?: { query: (text: string, values?: unknown[]) => Promise<{ rows: unknown[]; rowCount: number | null }> } | null; serviceToken?: string },
): void => {
  app.get('/internal/workspace-alias/:alias', async (req, reply) => {
    // Internal route: nunca participa de CORS público — remove qualquer header CORS que o hook global possa ter setado
    reply.removeHeader('access-control-allow-origin');
    reply.removeHeader('access-control-allow-credentials');
    const serviceToken = deps.serviceToken ?? process.env.AGENT_AUTH_SERVICE_TOKEN ?? '';
    const header = (req.headers['x-agent-service-token'] as string | undefined)?.trim();
    const auth = (req.headers['authorization'] as string | undefined)?.trim();
    const bearer = auth?.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : undefined;
    const provided = header ?? bearer;
    let valid = false;
    if (provided && serviceToken) {
      try {
        const a = Buffer.from(provided, 'utf8');
        const b = Buffer.from(serviceToken, 'utf8');
        if (a.length === b.length) {
          // timingSafeEqual evita oracle de tempo e resposta é não enumerável (mesmo 401 para ausente/incorreto)
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const crypto = require('node:crypto');
          valid = crypto.timingSafeEqual(a, b);
        }
      } catch {
        valid = false;
      }
    }
    if (!valid) {
      return reply.code(401).send({ code: 'auth.invalid_service_token', message: 'Invalid service token' });
    }
    const alias = (req.params as { alias?: string })?.alias?.trim();
    if (!alias) return reply.code(400).send({ code: 'agent.invalid_alias' });
    const canonical = deps.pool ? await resolveCanonicalHouseholdId(deps.pool, alias) : alias;
    return reply.send({ alias, canonicalHouseholdId: canonical, householdId: canonical });
  });
};
