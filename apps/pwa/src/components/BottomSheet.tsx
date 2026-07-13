"use client";

import { useCallback, useEffect, type ReactNode } from "react";

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

export default function BottomSheet({
  open,
  onClose,
  title,
  children,
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
    [onClose],
  );

  useEffect(() => {
    if (!open) return;
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, handleKeyDown]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-20" role="dialog" aria-modal="true">
      {/* Overlay */}
      <div
        className="absolute inset-0 animate-fade-in"
        style={{ background: "rgba(10,30,20,.45)" }}
        onClick={onClose}
      />

      {/* Sheet container */}
      <div
        className="absolute bottom-0 left-0 right-0 flex max-h-[88vh] flex-col overflow-y-auto bg-surface shadow-[var(--shadow-sheet)]"
        style={{
          borderRadius: "var(--sheet-radius)",
          animation: "sheetUp 0.28s cubic-bezier(.2,.8,.2,1)",
          padding: "22px 20px 32px",
        }}
      >
        {/* Drag handle */}
        <div className="mx-auto mb-[18px] h-1 w-9 flex-none rounded-full bg-border-strong" />

        {/* Header */}
        <div className="mb-4 flex items-center gap-3">
          <h2 className="flex-1 text-[16px] font-extrabold text-text-primary">
            {title}
          </h2>
          <button
            onClick={onClose}
            className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-fill-light text-text-muted transition-colors hover:text-text-secondary"
            aria-label="Fechar"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        {children}
      </div>
    </div>
  );
}
