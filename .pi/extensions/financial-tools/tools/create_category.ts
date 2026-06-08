/**
 * create_category — Pi tool
 */

import { Type } from "typebox";
import { randomUUID } from "node:crypto";

async function query<T extends { rows: unknown[] }>(text: string, params?: unknown[]): Promise<T> {
  const { default: pg } = await import("pg");
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try { const r = await pool.query(text, params); return r as T; }
  finally { await pool.end(); }
}
function isUUID(s: string) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s); }

export const createCategoryTool = {
  name: "create_category",
  label: "Create Category",
  description: "Create a new category (expense or income type). Detects categories with the same name and kind and asks the user to confirm. Pass force=true to override.",
  parameters: Type.Object({
    name: Type.String(),
    kind: Type.String({ description: "expense or income" }),
    householdId: Type.String(),
    force: Type.Optional(Type.Boolean({ description: "Skip duplicate detection." })),
  }),

  async execute(_id: string, params: any, _sig: AbortSignal, onUpdate: ((u: { content: { type: "text"; text: string }[] }) => void) | undefined) {
    if (!params.name?.trim()) throw new Error("name cannot be empty");
    if (!["expense", "income"].includes(params.kind)) throw new Error("kind must be expense or income");
    if (!isUUID(params.householdId)) throw new Error("household_id must be a valid UUID");

    if (!params.force) {
      const existing = await query<{ rows: { id: string; name: string; kind: string }[] }>(
        `SELECT id, name, kind FROM categories
         WHERE household_id = $1
           AND name_normalized = LOWER(UNACCENT($2))
           AND kind = $3
           AND deleted_at IS NULL
         LIMIT 1`,
        [params.householdId, params.name.trim(), params.kind]
      );
      if (existing.rows.length) {
        const ex = existing.rows[0];
        return {
        success: false,

          content: [{
            type: "text",
            text: `⚠️ Já existe uma categoria com esse nome (${ex.kind}):
• "${ex.name}"
ID: ${ex.id}

Quer criar mesmo assim? Responda "sim" para confirmar.`,
          }],
          details: {
            duplicate_detected: true,
            existing_category_id: ex.id,
            match_type: "exact_name",
            hint: "Ask the user to confirm. If they want to create a new category with the same name anyway, retry with force=true.",
          },
        };
      }
    }

    const rid = randomUUID();
    const r = await query<{ rows: { id: string }[] }>(
      `INSERT INTO categories (id, household_id, name, kind, active, created_at) VALUES ($1, $2, $3, $4, true, NOW()) RETURNING id`,
      [rid, params.householdId, params.name.trim(), params.kind]
    );

    onUpdate?.({ content: [{ type: "text", text: "Criando categoria..." }] });
    return {
        success: true,

        categoryId: r.rows[0].id,
      content: [{ type: "text", text: `✅ Categoria criada: ${params.name.trim()} (${params.kind})` }],
      details: { category_id: r.rows[0].id },
    };
  },
};