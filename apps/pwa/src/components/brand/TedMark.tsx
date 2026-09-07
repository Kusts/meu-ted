/**
 * TedMark — geometric mascot monogram (item premium 3).
 *
 * Mint stroke on charcoal circle, derived from the brand sheet
 * (public/brand/app-icon-source.png): bear ears + M-check mark.
 * Inline SVG (no raster), theme-independent brand colors.
 *
 * Variants: "mark" (default), "relaxed" (resting bear for empty states),
 * "check" (mark + emerald check badge for achievements).
 *
 * The mascot is reserved for: Home TED shortcut, TED avatars, emotional
 * empty states and the startup splash. NEVER on generic buttons, form
 * headers, statements or the bottom nav.
 */

interface TedMarkProps {
  size?: number;
  variant?: "mark" | "relaxed" | "check";
  label?: string;
}

const CHARCOAL = "#1F2A27";
const MINT = "#66C2A3";
const EMERALD = "#0B7A5B";

export function TedMark({ size = 28, variant = "mark", label = "Ted" }: TedMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label={label}
    >
      <circle cx="32" cy="32" r="30" fill={CHARCOAL} />
      {/* Ears */}
      <circle cx="20" cy="17" r="6.5" fill={MINT} />
      <circle cx="44" cy="17" r="6.5" fill={MINT} />
      {variant === "relaxed" ? (
        <g stroke={MINT} strokeWidth="4" strokeLinecap="round" fill="none">
          {/* Resting closed eyes */}
          <path d="M20 36 q5 5 10 0" />
          <path d="M34 36 q5 5 10 0" />
          {/* Content smile */}
          <path d="M26 47 q6 4 12 0" />
        </g>
      ) : (
        <path
          d="M18 44 L18 32 L26 40 L32 28 L38 40 L46 32 L46 44"
          fill="none"
          stroke={MINT}
          strokeWidth="5.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      {variant === "check" && (
        <g>
          <circle cx="47" cy="47" r="11" fill={EMERALD} />
          <path
            d="M42 47 l3.5 3.5 L52 43"
            fill="none"
            stroke="#FFFFFF"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      )}
    </svg>
  );
}

/**
 * TedAvatar — 36px TED avatar for insight cards and bubbles.
 */
export function TedAvatar({ size = 36, label = "TED" }: { size?: number; label?: string }) {
  return (
    <span
      className="flex flex-none items-center justify-center overflow-hidden rounded-full ring-1 ring-white/10"
      style={{ width: size, height: size }}
      aria-hidden={label === undefined}
    >
      <TedMark size={size} label={label} />
    </span>
  );
}

export default TedMark;
