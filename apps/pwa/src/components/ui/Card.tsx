"use client";

import { forwardRef, type HTMLAttributes } from "react";

export type CardVariant = "default" | "glass" | "interactive" | "gradient";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
  elevation?: 1 | 2 | 3;
}

const variantStyles: Record<CardVariant, string> = {
  default:
    "bg-surface-1 border border-border-subtle shadow-card text-text-primary",
  glass:
    "bg-surface-1/75 backdrop-blur-md border border-border-subtle shadow-card text-text-primary",
  interactive:
    "bg-surface-1 border border-border-subtle shadow-card text-text-primary hover:border-border-medium hover:bg-surface-2/60 cursor-pointer active:scale-[0.99] transition-all duration-150",
  gradient:
    "bg-gradient-to-br from-[#0F6B45] to-[#0A3A28] dark:from-[#131916] dark:to-[#0B0F0E] dark:border dark:border-primary/20 text-white shadow-card",
};

const elevationStyles: Record<1 | 2 | 3, string> = {
  1: "p-4 rounded-[16px]",
  2: "p-5 rounded-[18px] shadow-elevated",
  3: "p-6 rounded-[20px] shadow-elevated",
};

export const Card = forwardRef<HTMLDivElement, CardProps>(
  (
    { variant = "default", elevation = 1, className = "", children, ...props },
    ref
  ) => {
    return (
      <div
        ref={ref}
        className={`${variantStyles[variant]} ${elevationStyles[elevation]} ${className}`}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Card.displayName = "Card";
export default Card;
