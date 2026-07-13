/**
 * Tinted badge — identity chip for accounts, cards, and subscriptions.
 *
 * Usage: <Badge label="Nubank Crédito" color="#820AD1" size="sm" />
 *
 * Abbreviation rules (kept compact, max 2 chars):
 *   - 1 word  → first 2 chars uppercase ("Nubank" → "NU")
 *   - 2+ words → initials of the first two words ("Nubank Crédito" → "NC")
 *
 * The full label is exposed via the `title` attribute as a native tooltip
 * and for QA inspection. The element stays aria-hidden because the
 * surrounding UI (account name text) is the canonical accessible label.
 */

import type { CSSProperties } from "react";

interface BadgeProps {
  label: string;
  color?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

function getAbbreviation(label: string): string {
  const words = label.trim().split(/\s+/).filter((w) => w.length > 0);
  if (words.length === 0) return "";
  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }
  return (words[0][0] + words[1][0]).toUpperCase();
}

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

const SIZE_MAP = {
  sm: { size: 28, fontSize: 11, radius: 8 },
  md: { size: 36, fontSize: 13, radius: 10 },
  lg: { size: 52, fontSize: 18, radius: 14 },
} as const;

export default function Badge({
  label,
  color = "#0E8C5A",
  size = "md",
  className = "",
}: BadgeProps) {
  const dims = SIZE_MAP[size];
  const chars = getAbbreviation(label);

  const style: CSSProperties = {
    width: dims.size,
    height: dims.size,
    borderRadius: dims.radius,
    background: hexToRgba(color, 0.14),
    color,
    fontSize: dims.fontSize,
    fontWeight: 700,
    fontFamily: "var(--font-space-grotesk), 'Space Grotesk', monospace",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    lineHeight: 1,
  };

  return (
    <span
      className={`inline-flex items-center justify-center flex-none ${className}`}
      style={style}
      title={label}
      aria-hidden="true"
      data-testid="badge"
      data-full-label={label}
    >
      {chars}
    </span>
  );
}