"use client";

interface WriteErrorBannerProps {
  message: string | null;
  onDismiss: () => void;
  /** Optional callback for retry. When provided, shows a "Tentar de novo" button. */
  onRetry?: () => void;
}

export function WriteErrorBanner({
  message,
  onDismiss,
  onRetry,
}: WriteErrorBannerProps) {
  if (!message) return null;

  return (
    <div
      data-testid="write-error-banner"
      role="alert"
      className="mx-5 mb-3 flex items-center justify-between gap-2 rounded-[12px] bg-danger-tint px-4 py-2.5"
    >
      <span className="min-w-0 flex-1 text-[12px] font-semibold text-danger">
        <span aria-hidden="true">⚠</span> {message}
      </span>
      <div className="flex flex-none items-center gap-1">
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            aria-label="Tentar de novo"
            className="rounded-[8px] border border-danger/40 bg-surface px-2.5 py-1 text-[11px] font-bold text-danger transition-colors hover:bg-danger/10"
          >
            Tentar de novo
          </button>
        )}
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Fechar"
          className="flex-none text-[16px] leading-none text-danger/60 hover:text-danger"
        >
          ×
        </button>
      </div>
    </div>
  );
}