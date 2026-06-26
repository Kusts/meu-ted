import type { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  /** Slot for action button — rendered on the right */
  action?: ReactNode;
}

export default function PageHeader({
  title,
  subtitle,
  action,
}: PageHeaderProps) {
  return (
    <div className="flex items-center justify-between px-5 pb-2 pt-[--page-pt]">
      <div className="min-w-0 flex-1">
        <h1 className="text-[22px] font-extrabold leading-tight text-text-primary">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-0.5 text-xs font-semibold text-text-muted">
            {subtitle}
          </p>
        )}
      </div>
      {action && <div className="ml-3 flex-none">{action}</div>}
    </div>
  );
}
