"use client";

import { useCallback, useEffect, useState } from "react";

export type BlockLayout = {
  order: string[];
  hidden: string[];
};

/**
 * Layout personalizável de blocos com persistência em localStorage.
 * - `defaultOrder` é o schema: ids desconhecidos no storage são ignorados,
 *   blocos novos (no default, fora do storage) aparecem visíveis no fim.
 * - `hidden` nunca contém ids fora do schema (clamp na leitura e na escrita).
 */
export function clampLayout(raw: unknown, defaultOrder: string[]): BlockLayout {
  const known = new Set(defaultOrder);
  let order: string[] = [];
  let hidden: string[] = [];
  if (raw && typeof raw === "object") {
    const r = raw as Record<string, unknown>;
    if (Array.isArray(r.order)) {
      order = r.order.filter((id): id is string => typeof id === "string" && known.has(id));
    }
    if (Array.isArray(r.hidden)) {
      hidden = r.hidden.filter((id): id is string => typeof id === "string" && known.has(id));
    }
  }
  for (const id of defaultOrder) {
    if (!order.includes(id)) order.push(id);
  }
  return { order: [...new Set(order)], hidden: [...new Set(hidden)] };
}

const readStored = (storageKey: string): unknown => {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
};

export function useBlockLayout(storageKey: string, defaultOrder: string[]) {
  const [layout, setLayout] = useState<BlockLayout>(() => ({
    order: [...defaultOrder],
    hidden: [],
  }));
  const [editing, setEditing] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setLayout(clampLayout(readStored(storageKey), defaultOrder));
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(layout));
    } catch {
      // storage indisponível: layout segue em memória
    }
  }, [layout, hydrated, storageKey]);

  const toggle = useCallback((id: string) => {
    setLayout((prev) => ({
      order: prev.order,
      hidden: prev.hidden.includes(id)
        ? prev.hidden.filter((h) => h !== id)
        : [...prev.hidden, id],
    }));
  }, []);

  const move = useCallback((id: string, direction: -1 | 1) => {
    setLayout((prev) => {
      const order = [...prev.order];
      const index = order.indexOf(id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= order.length) return prev;
      const [removed] = order.splice(index, 1);
      order.splice(target, 0, removed!);
      return { order, hidden: prev.hidden };
    });
  }, []);

  const reset = useCallback(() => {
    setLayout({ order: [...defaultOrder], hidden: [] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  const visible = layout.order.filter((id) => !layout.hidden.includes(id));

  return { layout, visible, editing, setEditing, toggle, move, reset, hydrated };
}
