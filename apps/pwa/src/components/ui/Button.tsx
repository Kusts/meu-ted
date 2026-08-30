"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "outline"
  | "ghost"
  | "danger"
  | "accent";

export type ButtonSize = "sm" | "md" | "lg" | "icon";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    "bg-primary text-white hover:bg-primary-hover shadow-sm disabled:opacity-50",
  secondary:
    "bg-surface-2 text-text-primary border border-border-subtle hover:bg-surface-3 disabled:opacity-50",
  outline:
    "bg-transparent text-text-primary border border-border-medium hover:bg-surface-2 disabled:opacity-50",
  ghost:
    "bg-transparent text-text-primary hover:bg-surface-2 disabled:opacity-50",
  danger:
    "bg-danger text-white hover:opacity-90 disabled:opacity-50",
  accent:
    "bg-accent-money text-text-primary font-bold shadow-fab hover:opacity-95 disabled:opacity-50",
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-[12px] rounded-[10px]",
  md: "h-10 px-4 text-[14px] rounded-[12px]",
  lg: "h-12 px-6 text-[15px] rounded-[14px]",
  icon: "h-10 w-10 p-0 rounded-[12px] flex items-center justify-center flex-none",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "primary",
      size = "md",
      loading = false,
      leftIcon,
      rightIcon,
      className = "",
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        aria-busy={loading ? "true" : undefined}
        className={`inline-flex items-center justify-center gap-2 font-semibold transition-all duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
          variantStyles[variant]
        } ${sizeStyles[size]} ${className}`}
        {...props}
      >
        {loading ? (
          <svg
            className="h-4 w-4 animate-spin"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        ) : (
          <>
            {leftIcon && <span className="flex-none">{leftIcon}</span>}
            {children}
            {rightIcon && <span className="flex-none">{rightIcon}</span>}
          </>
        )}
      </button>
    );
  }
);

Button.displayName = "Button";
export default Button;
