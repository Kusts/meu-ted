/** deactivate_category — Pi tool */
import { Type } from "typebox";
async function query<T extends { rows: unknown[] }>(text: string, params?: unknown[]): Promise<T> {
  const { default: pg } = await import("pg");
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try { const r = await pool.query(text, params); return r as T; }
  finally { await pool.end(); }
}
function isUUID(s: string) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s); }

export const deactivateCategoryTool = {
  name: "deactivate_category",
  label: "Deactivate Category",
  description: "Soft-delete a category. Only allowed if category has no active transactions.",
  parameters: Type.Object({ categoryId: Type.String(), householdId: Type.String() }),
  async execute(_id: string, params: any, _sig: AbortSignal, onUpdate: ((u: { content: { type: "text"; text: string }[] }) => void) | undefined) {
    if (!isUUID(params.categoryId)) throw new Error("category_id must be a valid UUID");
    if (!isUUID(params.householdId)) throw new Error("household_id must be a valid UUID");

    const ex = await query<{ rows: { id: string }[] }>(`SELECT id FROM categories WHERE id = $1 AND household_id = $2 AND deleted_at IS NULL LIMIT 1`, [params.categoryId, params.householdId]);
    if (!ex.rows.length) throw new Error("Category not found or already deactivated");

    const tx = await query<{ rows: { cnt: string }[] }>(
      `SELECT COUNT(*) as cnt FROM transactions WHERE category_id = $1 AND household_id = $2 AND deleted_at IS NULL`,
      [params.categoryId, params.householdId]
    );
    if (parseInt(tx.rows[0].cnt, 10) > 0) throw new Error("Category has transactions and cannot be deactivated");

    const r = await query<{ rows: { id: string }[] }>(`UPDATE categories SET deleted_at = NOW() WHERE id = $1 AND household_id = $2 AND deleted_at IS NULL RETURNING id`, [params.categoryId, params.householdId]);

    onUpdate?.({ content: [{ type: "text", text: "Desativando categoria..." }] });
    return { content: [{ type: "text", text: `✅ Categoria desativada.` }], details: { category_id: r.rows[0].id } };
  },
};