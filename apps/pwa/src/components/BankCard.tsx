"use client";

import { resolveBankPreset, type BankPreset } from "@/lib/bank-presets";

export interface BankCardProps {
  bankId?: string;
  preset?: BankPreset;
  cardName: string;
  maskedNumber?: string;
  holderName?: string;
  expiry?: string;
  network?: "visa" | "mastercard" | "elo" | "amex" | "hipercard";
  variant?: string;
  className?: string;
  onClick?: () => void;
  compact?: boolean;
}

function Chip() {
  return (
    <div
      data-testid="card-chip"
      aria-hidden="true"
      className="relative overflow-hidden rounded-[5px] border border-yellow-600/30 shadow-inner"
      style={{
        width: 38,
        height: 28,
        background: "linear-gradient(135deg, #FFD700 0%, #D4AF37 25%, #B8860B 50%, #FFD700 75%, #DAA520 100%)",
      }}
    >
      <div className="absolute inset-[3px] rounded-[3px] border border-yellow-800/20" />
      <div className="absolute left-1/2 top-0 h-full w-[1px] -translate-x-1/2 bg-yellow-900/30" />
      <div className="absolute top-1/2 h-[1px] w-full -translate-y-1/2 bg-yellow-900/30" />
      <div className="absolute left-[30%] top-0 h-full w-[1px] bg-yellow-900/15" />
      <div className="absolute right-[30%] top-0 h-full w-[1px] bg-yellow-900/15" />
    </div>
  );
}

function ContactlessIcon() {
  return (
    <div data-testid="card-contactless" aria-hidden="true" className="flex items-center">
      <svg width="22" height="18" viewBox="0 0 24 18" fill="none" aria-hidden="true">
        <path d="M12 14C12 14 13.5 12.5 13.5 10C13.5 7.5 12 6 12 6" stroke="white" strokeOpacity="0.9" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M14.5 15.2C16.2 13.6 17 11.8 17 10C17 8.2 16.2 6.4 14.5 4.8" stroke="white" strokeOpacity="0.9" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M17.2 16.8C19.5 14.6 20.8 12.3 20.8 10C20.8 7.7 19.5 5.4 17.2 3.2" stroke="white" strokeOpacity="0.9" strokeWidth="1.6" strokeLinecap="round" />
        <circle cx="9" cy="10" r="1.2" fill="white" fillOpacity="0.9" />
      </svg>
    </div>
  );
}

function Flag({ network }: { network: string }) {
  const n = (network || "mastercard").toLowerCase();
  if (n === "visa") {
    return (
      <div data-testid="card-flag" aria-label="Visa" className="flex items-center">
        <span className="font-black italic tracking-tighter text-white text-[16px]" style={{ fontFamily: "Arial Black, sans-serif", textShadow: "0 1px 2px rgba(0,0,0,0.3)" }}>
          VISA
        </span>
      </div>
    );
  }
  if (n === "elo") {
    return (
      <div data-testid="card-flag" aria-label="Elo" className="flex items-center gap-[1px]">
        <span className="rounded-sm bg-black px-1 py-0.5 text-[9px] font-black tracking-widest text-white">elo</span>
      </div>
    );
  }
  // Default mastercard
  return (
    <div data-testid="card-flag" aria-label="Mastercard" className="flex items-center">
      <div className="relative h-7 w-11">
        <div className="absolute left-0 top-0 h-7 w-7 rounded-full bg-[#EB001B] opacity-95" />
        <div className="absolute right-0 top-0 h-7 w-7 rounded-full bg-[#F79E1B] opacity-95" />
        <div className="absolute left-1/2 top-1/2 h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#FF5F00] mix-blend-screen opacity-80" />
      </div>
    </div>
  );
}

export default function BankCard({
  bankId,
  preset,
  cardName,
  maskedNumber = "•••• •••• •••• ••••",
  holderName,
  expiry,
  network,
  className = "",
  onClick,
  compact = false,
}: BankCardProps) {
  const resolved: BankPreset = preset ?? resolveBankPreset({ id: bankId ?? "nubank", name: cardName });
  const flagNetwork = network ?? resolved.network;

  return (
    <div
      data-testid="bank-card"
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      className={`relative flex flex-col justify-between overflow-hidden rounded-[16px] p-4 text-white shadow-elevated select-none ${onClick ? "cursor-pointer active:scale-[0.98] transition-transform" : ""} ${className}`}
      style={{
        background: resolved.cardGradient,
        aspectRatio: "85.6 / 53.98",
        minHeight: compact ? 130 : 168,
        color: resolved.textColor,
        // Ensure mobile touch target
        touchAction: "manipulation",
      }}
    >
      {/* Subtle pattern overlay for realism */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          background: `radial-gradient(ellipse at 20% 20%, white 0%, transparent 50%), radial-gradient(ellipse at 80% 80%, black 0%, transparent 60%)`,
        }}
      />
      {/* Top row: bank name + contactless */}
      <div className="relative flex items-start justify-between">
        <div className="min-w-0">
          <div className="truncate text-[13px] font-extrabold tracking-tight drop-shadow-sm" style={{ color: resolved.textColor }}>
            {resolved.name}
          </div>
          <div className="truncate text-[11px] font-semibold opacity-80" style={{ color: resolved.textColor }}>
            {cardName}
          </div>
        </div>
        <ContactlessIcon />
      </div>

      {/* Middle: chip */}
      <div className="relative mt-2 flex items-center gap-3">
        <Chip />
        <div className="flex-1" />
      </div>

      {/* Bottom: number, holder, expiry, flag */}
      <div className="relative mt-auto">
        <div className="font-mono text-[15px] font-medium tracking-[0.14em] drop-shadow-sm" style={{ color: resolved.textColor }}>
          {maskedNumber}
        </div>
        <div className="mt-1.5 flex items-end justify-between gap-2">
          <div className="min-w-0 flex-1">
            {holderName ? (
              <div className="truncate text-[10px] font-bold uppercase tracking-[0.12em] opacity-85" style={{ color: resolved.textColor }}>
                {holderName}
              </div>
            ) : (
              <div className="text-[10px] opacity-60">TITULAR</div>
            )}
            {expiry && (
              <div className="font-mono text-[10px] font-semibold tracking-widest opacity-80" style={{ color: resolved.textColor }}>
                {expiry}
              </div>
            )}
          </div>
          <Flag network={flagNetwork} />
        </div>
      </div>

      {/* Accent line for BB/XP etc. */}
      {resolved.accentColor && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute bottom-0 left-0 h-[4px] w-full"
          style={{ background: resolved.accentColor, opacity: 0.9 }}
        />
      )}
    </div>
  );
}
