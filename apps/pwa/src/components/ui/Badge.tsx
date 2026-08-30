"use client";

import type { CSSProperties, ReactNode } from "react";

export type BadgeVariant =
  | "abbreviation"
  | "success"
  | "danger"
  | "warning"
  | "info"
  | "neutral"
  | "primary"
  | "accent";

export interface BadgeProps {
  label?: string;
  variant?: BadgeVariant;
  color?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
  children?: ReactNode;
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

const variantClasses: Record<Exclude<BadgeVariant, "abbreviation">, string> = {
  success: "bg-success-tint text-success border border-success/20",
  danger: "bg-danger-tint text-danger border border-danger/20",
  warning: "bg-warning-tint text-warning border border-warning/20",
  info: "bg-info-tint text-info border border-info/20",
  neutral: "bg-surface-2 text-text-secondary border border-border-subtle",
  primary: "bg-primary-tint text-primary border border-primary/20",
  accent: "bg-accent-money-glow text-accent-money border border-accent-money/20",
};

export function Badge({
  label,
  variant,
  color = "#0E8C5A",
  size = "md",
  className = "",
  children,
}: BadgeProps) {
  // If variant is explicitly provided and not abbreviation, render as semantic pill badge
  if (variant && variant !== "abbreviation") {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold tracking-wide transition-colors ${
          variantClasses[variant]
        } ${className}`}
        data-testid="badge"
      >
        {children || label}
      </span>
    );
  }

  // Otherwise, render as abbreviation identity chip (preserves full backward compatibility)
  const dims = SIZE_MAP[size];
  const chars = label ? getAbbreviation(label) : "";

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

export default Badge;