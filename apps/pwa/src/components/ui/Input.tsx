"use client";

import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from "react";

export interface InputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "prefix"> {
  label?: string;
  error?: string;
  helperText?: string;
  prefix?: ReactNode;
  suffix?: ReactNode;
  containerClassName?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      error,
      helperText,
      prefix,
      suffix,
      id: customId,
      className = "",
      containerClassName = "",
      disabled,
      ...props
    },
    ref
  ) => {
    const generatedId = useId();
    const inputId = customId || generatedId;
    const errorId = `${inputId}-error`;
    const helperId = `${inputId}-helper`;

    return (
      <div className={`flex flex-col gap-1.5 ${containerClassName}`}>
        {label && (
          <label
            htmlFor={inputId}
            className="text-[12px] font-semibold tracking-wide text-text-secondary"
          >
            {label}
          </label>
        )}
        <div className="relative flex items-center">
          {prefix && (
            <div className="absolute left-3.5 flex items-center justify-center font-mono text-[14px] font-semibold text-text-muted pointer-events-none">
              {prefix}
            </div>
          )}
          <input
            ref={ref}
            id={inputId}
            disabled={disabled}
            aria-invalid={error ? "true" : undefined}
            aria-describedby={
              error ? errorId : helperText ? helperId : undefined
            }
            className={`w-full rounded-[12px] border bg-surface-2 px-3.5 py-2.5 text-[16px] text-text-primary transition-all duration-150 placeholder:text-text-muted focus-visible:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50 ${
              prefix ? "pl-11" : ""
            } ${suffix ? "pr-11" : ""} ${
              error
                ? "border-danger focus-visible:border-danger focus-visible:ring-danger"
                : "border-border-subtle focus-visible:border-primary focus-visible:ring-primary"
            } ${className}`}
            {...props}
          />
          {suffix && (
            <div className="absolute right-3.5 flex items-center justify-center text-[12px] font-semibold text-text-muted pointer-events-none">
              {suffix}
            </div>
          )}
        </div>
        {error ? (
          <p id={errorId} className="text-[11px] font-medium text-danger">
            {error}
          </p>
        ) : helperText ? (
          <p id={helperId} className="text-[11px] text-text-muted">
            {helperText}
          </p>
        ) : null}
      </div>
    );
  }
);

Input.displayName = "Input";
export default Input;
