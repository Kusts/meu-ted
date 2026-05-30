import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// Category Entity (REQ-019 hierarchical)
// ─────────────────────────────────────────────────────────────────────────────

export const CategoryKind = z.enum(['income', 'expense', 'transfer']);
export type CategoryKind = z.infer<typeof CategoryKind>;

export const Category = z.object({
  id: z.string().uuid(),
  householdId: z.string().uuid(),
  name: z.string().min(1).max(255),
  parentId: z.string().uuid().nullable(), // hierarchical: macro category has children
  kind: CategoryKind,
  normalizedName: z.string().max(255),
  active: z.boolean().default(true),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Category = z.infer<typeof Category>;

// Alias for matching merchant names to categories
export const CategoryAlias = z.object({
  id: z.string().uuid(),
  householdId: z.string().uuid(),
  categoryId: z.string().uuid(),
  alias: z.string().min(1).max(255),
  createdAt: z.string().datetime(),
});
export type CategoryAlias = z.infer<typeof CategoryAlias>;

// Partial for updates
export const CategoryUpdate = z.object({
  name: z.string().min(1).max(255).optional(),
  active: z.boolean().optional(),
  parentId: z.string().uuid().nullable().optional(),
});
export type CategoryUpdate = z.infer<typeof CategoryUpdate>;