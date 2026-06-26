"use client";

interface StatusBarProps {
  transparent?: boolean;
}

export default function StatusBar({ transparent = false }: StatusBarProps) {
  return (
    <div
      className={`flex h-[--status-bar-h] flex-none items-center justify-between px-5 ${
        transparent ? "bg-transparent" : "bg-surface"
      }`}
    >
      <span
        className="font-mono text-sm font-semibold"
        style={{ color: transparent ? "#fff" : "var(--color-text-primary)" }}
      >
        9:41
      </span>

      {/* Notch placeholder (centered) */}
      <div className="absolute left-1/2 top-[11px] h-6 w-24 -translate-x-1/2 rounded-[13px] bg-[#0E120F]" />

      {/* Signal + WiFi + Battery */}
      <div className="flex items-center gap-[7px]" style={{ color: transparent ? "#fff" : "var(--color-text-primary)" }}>
        {/* Signal bars */}
        <svg width="17" height="12" viewBox="0 0 17 12" fill="currentColor">
          <rect x="0" y="8" width="3" height="4" rx="1" />
          <rect x="4.5" y="5.5" width="3" height="6.5" rx="1" />
          <rect x="9" y="3" width="3" height="9" rx="1" />
          <rect x="13.5" y="0" width="3" height="12" rx="1" />
        </svg>
        {/* WiFi */}
        <svg width="23" height="12" viewBox="0 0 23 12" fill="none">
          <rect
            x="1"
            y="1"
            width="18"
            height="10"
            rx="2.6"
            stroke="currentColor"
            strokeOpacity="0.5"
          />
          <rect
            x="2.6"
            y="2.6"
            width="14"
            height="6.8"
            rx="1.3"
            fill="currentColor"
          />
          <rect
            x="20"
            y="4"
            width="1.8"
            height="4"
            rx="1"
            fill="currentColor"
            fillOpacity="0.5"
          />
        </svg>
      </div>
    </div>
  );
}
