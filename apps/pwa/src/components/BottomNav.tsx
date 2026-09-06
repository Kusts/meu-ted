"use client";

import type { ComponentType } from "react";
import {
  Home,
  Receipt,
  CalendarClock,
  MoreHorizontal,
  type LucideProps,
} from "lucide-react";
import { haptic } from "@/lib/ui/haptics";

export type NavItem = "home" | "records" | "payables" | "more";

interface BottomNavProps {
  active: NavItem;
  onFabClick: () => void;
  onMoreClick: () => void;
  onNavClick: (item: NavItem) => void;
}

interface ItemDef {
  key: NavItem;
  label: string;
  Icon: ComponentType<LucideProps>;
}

const ITEMS: ItemDef[] = [
  { key: "home", label: "Resumo", Icon: Home },
  { key: "records", label: "Registros", Icon: Receipt },
  { key: "payables", label: "A pagar", Icon: CalendarClock },
  { key: "more", label: "Mais", Icon: MoreHorizontal },
];

function NavButton({
  item,
  isActive,
  onClick,
}: {
  item: ItemDef;
  isActive: boolean;
  onClick: () => void;
}) {
  const ItemIcon = item.Icon;
  return (
    <button
      onClick={() => {
        haptic(8);
        onClick();
      }}
      aria-current={isActive ? "page" : undefined}
      className={`flex flex-1 flex-col items-center justify-center gap-0.5 rounded-[16px] px-2 pt-1.5 transition-all duration-200 focus-visible:outline-none ${
        isActive ? "bg-primary-tint" : "bg-transparent"
      }`}
      style={{
        color: isActive
          ? "var(--color-primary)"
          : "var(--color-text-muted)",
      }}
    >
      <ItemIcon size={20} strokeWidth={1.9} />
      {/* Spec AGY §4.3: dot esmeralda 4px sob o ícone ativo (transparente p/ não deslocar layout) */}
      <span
        aria-hidden="true"
        className={`h-1 w-1 rounded-full transition-all duration-200 ${
          isActive ? "bg-primary opacity-100" : "bg-transparent opacity-0"
        }`}
      />
      <span
        className={`text-[10px] ${
          isActive ? "font-bold" : "font-medium"
        } text-center`}
      >
        {item.label}
      </span>
    </button>
  );
}

export function BottomNav({
  active,
  onFabClick,
  onMoreClick,
  onNavClick,
}: BottomNavProps) {
  return (
    <nav
      data-nav="bottom"
      className="fixed bottom-0 inset-x-0 z-20 mx-auto flex max-w-[var(--shell-max-w)] items-stretch justify-around border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden"
      style={{ height: "var(--tab-bar-height)" }}
    >
      {/* Items: left side (Resumo, Registros) */}
      {ITEMS.slice(0, 2).map((item) => (
        <NavButton
          key={item.key}
          item={item}
          isActive={active === item.key}
          onClick={() => onNavClick(item.key)}
        />
      ))}

      {/* FAB — central */}
      <div
        className="relative flex flex-none items-start justify-center"
        style={{ width: 64 }}
      >
        <button
          onClick={() => {
            haptic(8);
            onFabClick();
          }}
          className="relative -top-2.5 flex h-[52px] w-[52px] items-center justify-center rounded-full text-white shadow-fab transition-transform active:scale-95 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
          style={{
            background: "linear-gradient(145deg, var(--primary), var(--primary-dark))",
          }}
          aria-label="Nova transação"
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.6"
            strokeLinecap="round"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      </div>

      {/* Items: right side (A pagar, Mais) */}
      {ITEMS.slice(2).map((item) => (
        <NavButton
          key={item.key}
          item={item}
          isActive={active === item.key}
          onClick={() => {
            if (item.key === "more") {
              onMoreClick();
            } else {
              onNavClick(item.key);
            }
          }}
        />
      ))}
    </nav>
  );
}

export default BottomNav;
