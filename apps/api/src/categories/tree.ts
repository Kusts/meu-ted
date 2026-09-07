/**
 * Canonical category tree (item 11 contract with Coder 1).
 *
 * GET /categories/tree returns macros with nested subs:
 *   { id, name, icon, kind: 'macro'|'sub', parentId?, subcategories?: [{id,name,icon}] }
 *
 * NOTE on `kind` vs `type`: `kind` is the TREE position (macro|sub) per the
 * agreed contract. The financial direction (expense|income) travels in the
 * extra `type` field so nothing that filters by expense|income breaks.
 * Sub entries also carry kind:'sub' + parentId for uniform consumption.
 */

import type { Category, CategoryKind, CategoryTreeKind } from '../types/domain.js';

export type CategoryTreeSub = {
  id: string;
  name: string;
  icon: string | null;
  kind: 'sub';
  parentId: string;
};

export type CategoryTreeMacro = {
  id: string;
  name: string;
  icon: string | null;
  kind: 'macro';
  type: CategoryKind;
  parentId?: undefined;
  isDefault: boolean;
  subcategories: CategoryTreeSub[];
};

export type CategoryTreeNode = CategoryTreeMacro;

const bySortThenName = (a: Category, b: Category): number => {
  const so = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
  if (so !== 0) return so;
  return a.name.localeCompare(b.name, 'pt-BR');
};

export const treeKindOf = (c: Category): CategoryTreeKind => (c.parentId ? 'sub' : 'macro');

export const buildCategoryTree = (categories: Category[]): CategoryTreeNode[] => {
  const active = categories.filter((c) => c.status === 'active');
  const byId = new Map(active.map((c) => [c.id, c]));
  const macros = active.filter((c) => !c.parentId).sort(bySortThenName);
  return macros.map((macro) => {
    const subs = active
      .filter((c) => c.parentId === macro.id && byId.has(c.id))
      .sort(bySortThenName)
      .map(
        (sub): CategoryTreeSub => ({
          id: sub.id,
          name: sub.name,
          icon: sub.icon ?? null,
          kind: 'sub',
          parentId: macro.id,
        }),
      );
    return {
      id: macro.id,
      name: macro.name,
      icon: macro.icon ?? null,
      kind: 'macro' as const,
      type: macro.kind,
      isDefault: macro.isDefault ?? false,
      subcategories: subs,
    };
  });
};
