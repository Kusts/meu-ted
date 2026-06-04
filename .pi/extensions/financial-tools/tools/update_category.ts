/** update_category — Pi tool */
import { Type } from "typebox";
async function query<T extends { rows: unknown[] }>(text: string, params?: unknown[]): Promise<T> {
  const { default: pg } = await import("pg");
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try { const r = await pool.query(text, params); return r as T; }
  finally { await pool.end(); }
}
function isUUID(s: string) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s); }

export const updateCategoryTool = {
  name: "update_category",
  label: "Update Category",
  description: "Update a category's name and/or kind.",
  parameters: Type.Object({
    categoryId: Type.String(),
    name: Type.String(),
    kind: Type.String(),
    householdId: Type.String(),
  }),
  async execute(_id: string, params: any, _sig: AbortSignal, onUpdate: ((u: { content: { type: "text"; text: string }[] }) => void) | undefined) {
    if (!isUUID(params.categoryId)) throw new Error("category_id must be a valid UUID");
    if (!params.name?.trim()) throw new Error("name cannot be empty");
    if (!["expense", "income"].includes(params.kind)) throw new Error("kind must be expense or income");
    if (!isUUID(params.householdId)) throw new Error("household_id must be a valid UUID");

    const ex = await query<{ rows: { id: string }[] }>(`SELECT id FROM categories WHERE id = $1 AND household_id = $2 AND deleted_at IS NULL LIMIT 1`, [params.categoryId, params.householdId]);
    if (!ex.rows.length) throw new Error("Category not found or inactive");

    const dup = await query<{ rows: { id: string }[] }>(
      `SELECT id FROM categories WHERE household_id = $1 AND LOWER(name) = LOWER($2) AND kind = $3 AND id != $4 AND deleted_at IS NULL LIMIT 1`,
      [params.householdId, params.name.trim(), params.kind, params.categoryId]
    );
    if (dup.rows.length) throw new Error(`Category "${params.name.trim()}" (${params.kind}) already exists`);

    const r = await query<{ rows: { id: string }[] }>(
      `UPDATE categories SET name = $1, kind = $2, updated_at = NOW() WHERE id = $3 AND household_id = $4 AND deleted_at IS NULL RETURNING id`,
      [params.name.trim(), params.kind, params.categoryId, params.householdId]
    );

    onUpdate?.({ content: [{ type: "text", text: "Atualizando categoria..." }] });
    return { content: [{ type: "text", text: `✅ Categoria atualizada: ${params.name.trim()} (${params.kind})` }], details: { category_id: r.rows[0].id } };
  },
};