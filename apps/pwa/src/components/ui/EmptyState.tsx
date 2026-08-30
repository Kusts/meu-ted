"use client";

import type { ReactNode } from "react";

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className = "",
}: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center p-8 text-center ${className}`}
    >
      {icon && (
        <div className="mb-3.5 flex h-14 w-14 items-center justify-center rounded-full bg-primary-tint text-primary">
          {icon}
        </div>
      )}
      <h3 className="text-[15px] font-bold text-text-primary">{title}</h3>
      {description && (
        <p className="mt-1 max-w-xs text-[13px] text-text-muted leading-relaxed">
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export default EmptyState;
