"use client";

import { useCallback, useEffect, type ReactNode } from "react";
import { X } from "lucide-react";

export interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  className?: string;
}

export function BottomSheet({
  open,
  onClose,
  title,
  children,
  className = "",
}: BottomSheetProps) {
  /* Lock body scroll while open */
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  /* Close on Escape key */
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    },
    [onClose]
  );

  useEffect(() => {
    if (!open) return;
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, handleKeyDown]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40" role="dialog" aria-modal="true">
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-xs animate-fade-in transition-opacity"
        onClick={onClose}
      />

      {/* Sheet container */}
      <div
        className={`fixed bottom-0 left-0 right-0 z-50 flex max-h-[92vh] flex-col overflow-y-auto rounded-t-[26px] border-t border-border-subtle bg-surface-1 shadow-sheet animate-sheet-up ${className}`}
        style={{
          padding: "20px 20px 32px",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="mx-auto mb-4 h-1 w-10 flex-none rounded-full bg-border-strong/60" />

        {/* Header */}
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="flex-1 text-[17px] font-bold text-text-primary">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-surface-2 text-text-muted transition-colors hover:text-text-primary focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
            aria-label="Fechar"
          >
            <X size={16} strokeWidth={2.4} />
          </button>
        </div>

        {/* Content */}
        {children}
      </div>
    </div>
  );
}

export default BottomSheet;
