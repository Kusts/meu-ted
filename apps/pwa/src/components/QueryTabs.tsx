"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

export interface QueryTabDef {
  key: string;
  label: string;
}

interface QueryTabsProps {
  /** Query param carrying the active tab (default "aba"). */
  param?: string;
  tabs: QueryTabDef[];
  defaultKey?: string;
  ariaLabel?: string;
}

/**
 * Segmented tab bar driven by the URL query (item 13).
 *
 * The active tab lives in `?aba=` so deep links, redirects and refreshes
 * land on the right tab, and unrelated params (?accountId=, ?cardId=) are
 * preserved when switching. 36px tall, tokens only, no emoji.
 */
export function QueryTabs({ param = "aba", tabs, defaultKey, ariaLabel = "Seções" }: QueryTabsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const fallback = defaultKey ?? tabs[0]?.key ?? "";
  const requested = searchParams.get(param);
  const active = tabs.some((t) => t.key === requested) ? (requested as string) : fallback;

  function select(key: string) {
    if (key === active) return;
    const next = new URLSearchParams(searchParams.toString());
    next.set(param, key);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }

  return (
    <div role="tablist" aria-label={ariaLabel} className="flex h-9 gap-1 rounded-xl bg-fill-light p-1">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          role="tab"
          aria-selected={active === tab.key}
          onClick={() => select(tab.key)}
          className={`flex flex-1 items-center justify-center rounded-[10px] px-2 text-[13px] font-bold transition-colors ${
            active === tab.key
              ? "bg-surface text-text-primary shadow-sm"
              : "text-text-muted"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

/** Active tab key for a query-driven section (falls back when absent/unknown). */
export function useQueryTab(param: string, validKeys: readonly string[], defaultKey: string): string {
  const searchParams = useSearchParams();
  const requested = searchParams.get(param);
  return validKeys.includes(requested ?? "") ? (requested as string) : defaultKey;
}
