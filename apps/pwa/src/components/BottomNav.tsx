"use client";

export type NavItem = "home" | "records" | "payables" | "more";

interface BottomNavProps {
  active: NavItem;
  onFabClick: () => void;
  onMoreClick: () => void;
  onNavClick: (item: NavItem) => void;
}

/* ── Minimal inline icons ── */

function HomeIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </svg>
  );
}

function RecordsIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
    </svg>
  );
}

function PayablesIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z" />
      <path d="M8 7h8M8 11h8M8 15h5" />
    </svg>
  );
}

function MoreIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="5" cy="12" r="1" fill="currentColor" />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
      <circle cx="19" cy="12" r="1" fill="currentColor" />
    </svg>
  );
}

/* ── Item config ── */

interface ItemDef {
  key: NavItem;
  label: string;
  icon: () => React.ReactNode;
}

const ITEMS: ItemDef[] = [
  { key: "home", label: "Resumo", icon: () => <HomeIcon /> },
  { key: "records", label: "Registros", icon: () => <RecordsIcon /> },
  /* FAB slot here — fake item to keep index */
  { key: "payables", label: "A pagar", icon: () => <PayablesIcon /> },
  { key: "more", label: "Mais", icon: () => <MoreIcon /> },
];

/* ── Component ── */

export default function BottomNav({
  active,
  onFabClick,
  onMoreClick,
  onNavClick,
}: BottomNavProps) {
  return (
    <nav
      data-nav="bottom"
      className="fixed bottom-0 inset-x-0 z-10 mx-auto flex max-w-[var(--shell-max-w)] items-stretch justify-around border-t border-border bg-surface pb-[env(safe-area-inset-bottom)]"
      style={{ height: "var(--tab-bar-height)" }}
    >
      {/* Items: left side (Resumo, Registros) */}
      {ITEMS.slice(0, 2).map((item) => {
        const isActive = active === item.key;
        return (
          <button
            key={item.key}
            onClick={() => onNavClick(item.key)}
            className="flex flex-1 flex-col items-center justify-center gap-0.5 pt-1.5"
            style={{ color: isActive ? "var(--color-primary)" : "var(--color-text-muted)" }}
          >
            {item.icon()}
            <span className={`text-[10px] ${isActive ? "font-bold" : "font-medium"} text-center`}>
              {item.label}
            </span>
          </button>
        );
      })}

      {/* FAB — central */}
      <div className="relative flex flex-none items-start justify-center" style={{ width: 64 }}>
        <button
          onClick={onFabClick}
          className="relative -top-2.5 flex h-[52px] w-[52px] items-center justify-center rounded-full text-white shadow-[var(--shadow-fab)] transition-transform active:scale-95"
          style={{
            background: "linear-gradient(145deg, #0E8C5A, #0A3A28)",
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
            className="flex flex-1 flex-col items-center justify-center gap-0.5 pt-1.5"
            style={{ color: isActive ? "var(--color-primary)" : "var(--color-text-muted)" }}
          >
            {item.icon()}
            <span className={`text-[10px] ${isActive ? "font-bold" : "font-medium"} text-center`}>
              {item.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
