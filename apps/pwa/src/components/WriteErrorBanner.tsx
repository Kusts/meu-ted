"use client";

interface WriteErrorBannerProps {
  message: string | null;
  onDismiss: () => void;
}

export function WriteErrorBanner({ message, onDismiss }: WriteErrorBannerProps) {
  if (!message) return null;

  return (
    <div className="mx-5 mb-3 flex items-center justify-between rounded-[12px] bg-danger-tint px-4 py-2.5">
      <span className="text-[12px] font-semibold text-danger">
        ⚠ {message}
      </span>
      <button
        type="button"
        onClick={onDismiss}
        className="ml-3 flex-none text-[16px] leading-none text-danger/60 hover:text-danger"
        aria-label="Fechar"
      >
        ×
      </button>
    </div>
  );
}
