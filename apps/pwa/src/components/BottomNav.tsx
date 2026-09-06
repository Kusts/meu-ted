"use client";

import { Icon, type IconName } from "@/components/ui/Icon";

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
  icon: IconName;
}

const ITEMS: ItemDef[] = [
  { key: "home", label: "Resumo", icon: "home" },
  { key: "records", label: "Registros", icon: "records" },
  { key: "payables", label: "A pagar", icon: "payables" },
  { key: "more", label: "Mais", icon: "more" },
];

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
      {ITEMS.slice(0, 2).map((item) => {
        const isActive = active === item.key;
        return (
          <button
            key={item.key}
            onClick={() => onNavClick(item.key)}
            aria-current={isActive ? "page" : undefined}
            className="flex flex-1 flex-col items-center justify-center gap-0.5 pt-1.5 transition-colors focus-visible:outline-none"
            style={{
              color: isActive
                ? "var(--color-primary)"
                : "var(--color-text-muted)",
            }}
          >
            <Icon name={item.icon} size={20} />
            <span
              className={`text-[10px] ${
                isActive ? "font-bold" : "font-medium"
              } text-center`}
            >
              {item.label}
            </span>
            {/* P5: indicador de aba ativa (pill/glow animado, sem layout shift) */}
            <span
              aria-hidden="true"
              className={`mt-0.5 h-1 rounded-full transition-all duration-200 ${
                isActive
                  ? "w-5 bg-primary opacity-100 shadow-[0_0_8px_var(--primary-glow)]"
                  : "w-0 bg-transparent opacity-0"
              }`}
            />
          </button>
        );
      })}

      {/* FAB — central */}
      <div
        className="relative flex flex-none items-start justify-center"
        style={{ width: 64 }}
      >
        <button
          onClick={onFabClick}
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
      {ITEMS.slice(2).map((item) => {
        const isActive = active === item.key;
        return (
          <button
            key={item.key}
            onClick={() => {
              if (item.key === "more") {
                onMoreClick();
              } else {
                onNavClick(item.key);
              }
            }}
            aria-current={isActive ? "page" : undefined}
            className="flex flex-1 flex-col items-center justify-center gap-0.5 pt-1.5 transition-colors focus-visible:outline-none"
            style={{
              color: isActive
                ? "var(--color-primary)"
                : "var(--color-text-muted)",
            }}
          >
            <Icon name={item.icon} size={20} />
            <span
              className={`text-[10px] ${
                isActive ? "font-bold" : "font-medium"
              } text-center`}
            >
              {item.label}
            </span>
            {/* P5: indicador de aba ativa (pill/glow animado, sem layout shift) */}
            <span
              aria-hidden="true"
              className={`mt-0.5 h-1 rounded-full transition-all duration-200 ${
                isActive
                  ? "w-5 bg-primary opacity-100 shadow-[0_0_8px_var(--primary-glow)]"
                  : "w-0 bg-transparent opacity-0"
              }`}
            />
          </button>
        );
      })}
    </nav>
  );
}

export default BottomNav;
