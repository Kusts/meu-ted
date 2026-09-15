"use client";

import { useId, useRef } from "react";
import {
  OVERLAY_Z_INDEX,
  useBodyScrollLock,
  useOverlayDialog,
} from "@/lib/ui/overlay-a11y";

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
  const titleId = useId();
  const containerRef = useRef<HTMLDivElement>(null);

  useBodyScrollLock(open);

  /* SPEC §21 (H2): foco/trap/restore/Escape/inert via primitiva compartilhada
   * (substitui o padrão local). Foco inicial permanece no container do dialog
   * — leitores de tela anunciam o título via aria-labelledby. */
  useOverlayDialog(containerRef, {
    open,
    onEscape: onCancel,
    initialFocus: "container",
  });

  if (!open) return null;

  return (
    <div
      ref={containerRef}
      tabIndex={-1}
      className="fixed inset-0 flex items-center justify-center outline-none"
      style={{ zIndex: OVERLAY_Z_INDEX.confirmAction }}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      {/* Overlay */}
      <div
        className="absolute inset-0"
        style={{ background: "rgba(10,30,20,.55)" }}
        onClick={onCancel}
      />

      {/* Dialog */}
      <div className="relative z-10 mx-5 w-full max-w-sm rounded-[16px] bg-surface p-6 shadow-card">
        <h3 id={titleId} className="mb-2 text-[16px] font-extrabold text-text-primary">
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
