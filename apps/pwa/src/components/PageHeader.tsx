import type { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  /** Slot for action button — rendered on the right */
  action?: ReactNode;
}

import { WorkspaceSwitcher } from "./WorkspaceSwitcher";

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
      <div className="ml-3 flex flex-none items-center gap-2">
        <WorkspaceSwitcher compact />
        {action && <div>{action}</div>}
      </div>
    </div>
  );
}
