"use client";

import { useRef, type KeyboardEvent, type ReactNode } from "react";

export interface TabItem {
  value: string;
  label: ReactNode;
  icon?: ReactNode;
}

export interface TabsProps {
  items: TabItem[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
  ariaLabel?: string;
}

export function Tabs({
  items,
  value,
  onChange,
  className = "",
  ariaLabel = "Abas de navegação",
}: TabsProps) {
  const tabsRef = useRef<(HTMLButtonElement | null)[]>([]);

  const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex = index;
    if (e.key === "ArrowRight") {
      nextIndex = (index + 1) % items.length;
    } else if (e.key === "ArrowLeft") {
      nextIndex = (index - 1 + items.length) % items.length;
    } else {
      return;
    }

    e.preventDefault();
    const nextTab = items[nextIndex];
    onChange(nextTab.value);
    tabsRef.current[nextIndex]?.focus();
  };

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={`flex items-center gap-1 rounded-[14px] border border-border-subtle bg-surface-2 p-1 ${className}`}
    >
      {items.map((item, index) => {
        const isSelected = item.value === value;
        return (
          <button
            key={item.value}
            ref={(el) => {
              tabsRef.current[index] = el;
            }}
            type="button"
            role="tab"
            aria-selected={isSelected}
            tabIndex={isSelected ? 0 : -1}
            onClick={() => onChange(item.value)}
            onKeyDown={(e) => handleKeyDown(e, index)}
            className={`flex flex-1 items-center justify-center gap-2 rounded-[10px] py-2 px-3 text-[13px] font-semibold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
              isSelected
                ? "bg-surface-1 text-text-primary shadow-sm font-bold"
                : "text-text-muted hover:text-text-secondary"
            }`}
          >
            {item.icon && <span className="flex-none">{item.icon}</span>}
            <span>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export default Tabs;
