"use client";

import { useEffect } from "react";

interface ConfirmActionDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmActionDialog({
  open,
  title,
  message,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmActionDialogProps) {
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

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center" role="dialog" aria-modal="true">
      {/* Overlay */}
      <div
        className="absolute inset-0"
        style={{ background: "rgba(10,30,20,.55)" }}
        onClick={onCancel}
      />

      {/* Dialog */}
      <div className="relative z-10 mx-5 w-full max-w-sm rounded-[16px] bg-surface p-6 shadow-card">
        <h3 className="mb-2 text-[16px] font-extrabold text-text-primary">
          {title}
        </h3>
        <p className="mb-6 text-[13px] leading-relaxed text-text-secondary">
          {message}
        </p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-[12px] bg-fill-light py-3 text-[13px] font-bold text-text-secondary"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`flex-1 rounded-[12px] py-3 text-[13px] font-bold text-white ${
              danger ? "bg-danger" : "bg-primary"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
