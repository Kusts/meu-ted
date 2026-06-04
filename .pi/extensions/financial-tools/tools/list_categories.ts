/**
 * list_categories — Pi tool
 */

import { Type } from "typebox";

async function query<T extends { rows: unknown[] }>(text: string, params?: unknown[]): Promise<T> {
  const { default: pg } = await import("pg");
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try { const r = await pool.query(text, params); return r as T; }
  finally { await pool.end(); }
}

function isUUID(s: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

interface CategoryRow { id: string; name: string; kind: string; active: boolean; }

export const listCategoriesTool = {
  name: "list_categories",
  label: "List Categories",
  description: "List all active categories for a household, optionally filtered by kind (expense or income).",
  parameters: Type.Object({
    householdId: Type.String(),
    kind: Type.Optional(Type.String()),
  }),

  async execute(_id: string, params: { householdId: string; kind?: string }, _sig: AbortSignal, onUpdate: ((u: { content: { type: "text"; text: string }[] }) => void) | undefined) {
    if (!isUUID(params.householdId)) throw new Error("householdId must be a valid UUID");

    const sql = params.kind
      ? `SELECT id, name, kind, active FROM categories WHERE household_id = $1 AND kind = $2 AND deleted_at IS NULL ORDER BY name`
      : `SELECT id, name, kind, active FROM categories WHERE household_id = $1 AND deleted_at IS NULL ORDER BY name`;

    const args = params.kind ? [params.householdId, params.kind] : [params.householdId];
    const r = await query<{ rows: CategoryRow[] }>(sql, args);

    if (!r.rows.length) return { content: [{ type: "text", text: "Nenhuma categoria encontrada." }], details: { categories: [] } };

    const text = r.rows.map(c => `• ${c.name} (${c.kind})${!c.active ? " [inativa]" : ""}`).join("\n");
    onUpdate?.({ content: [{ type: "text", text: "Listando categorias..." }] });

    return { content: [{ type: "text", text }], details: { categories: r.rows } };
  },
};