import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// CategorizationRule Entity
// Rules for automatic categorization based on text patterns
// ─────────────────────────────────────────────────────────────────────────────

export const MatcherType = z.enum(['text', 'glob', 'regex']);
export type MatcherType = z.infer<typeof MatcherType>;

export const CategorizationRule = z.object({
  id: z.string().uuid(),
  householdId: z.string().uuid(),
  matcher: z.string().min(1),       // pattern to match
  matcherType: MatcherType.default('text'),
  categoryId: z.string().uuid(),     // target category
  priority: z.number().int().default(0),  // higher = checked first
  active: z.boolean().default(true),
  createdAt: z.string().datetime(),
});
export type CategorizationRule = z.infer<typeof CategorizationRule>;

export const CategorizationRuleCreate = z.object({
  householdId: z.string().uuid(),
  matcher: z.string().min(1),
  matcherType: MatcherType.optional(),
  categoryId: z.string().uuid(),
  priority: z.number().int().optional(),
});
export type CategorizationRuleCreate = z.infer<typeof CategorizationRuleCreate>;