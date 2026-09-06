"use client";

import { useCallback, useEffect, useRef, type ReactNode, type TouchEvent as ReactTouchEvent } from "react";
import { X } from "lucide-react";
import { OVERLAY_Z_INDEX, useBodyScrollLock } from "@/lib/ui/overlay-a11y";

/** Arrastar o cabeçalho mais que isso para baixo fecha a sheet. */
export const SHEET_DRAG_DISMISS_PX = 90;

function reducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function")
    return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

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
  /* Lock body scroll while open (ref-counted across stacked overlays) */
  useBodyScrollLock(open);
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ y: number; dy: number } | null>(null);

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

  /* Drag-to-dismiss no cabeçalho (spec AGY Onda 2/3 §4.2): só o header é
   * zona de arraste (touch-none) para não sequestrar a rolagem do conteúdo.
   * Segue o dedo sem transição; ao soltar, >90px fecha, senão retorna com
   * 200ms (instantâneo sob reduced-motion, que mantém o dismiss). */
  function resetSheetTransform() {
    const el = sheetRef.current;
    if (el) {
      el.style.transform = "";
      el.style.transition = "";
    }
  }

  function onDragStart(e: ReactTouchEvent<HTMLDivElement>) {
    if (e.touches.length > 1) return;
    const t = e.touches[0];
    if (!t) return;
    dragRef.current = { y: t.clientY, dy: 0 };
    const el = sheetRef.current;
    if (el) el.style.transition = "none";
  }

  function onDragMove(e: ReactTouchEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    const t = e.touches[0];
    if (!t) return;
    const dy = t.clientY - drag.y;
    if (dy <= 0) return;
    drag.dy = dy;
    if (!reducedMotion()) {
      const el = sheetRef.current;
      if (el) el.style.transform = `translateY(${dy}px)`;
    }
  }

  function onDragEnd() {
    const drag = dragRef.current;
    dragRef.current = null;
    const el = sheetRef.current;
    if (el) {
      el.style.transition = reducedMotion()
        ? ""
        : "transform 200ms var(--easing-standard)";
      el.style.transform = "";
    }
    if (drag && drag.dy > SHEET_DRAG_DISMISS_PX) onClose();
  }

  function onDragCancel() {
    dragRef.current = null;
    resetSheetTransform();
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0"
      style={{ zIndex: OVERLAY_Z_INDEX.sheet }}
      role="dialog"
      aria-modal="true"
    >
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-xs animate-fade-in transition-opacity"
        onClick={onClose}
      />

      {/* Sheet container */}
      <div
        ref={sheetRef}
        className={`fixed bottom-0 left-0 right-0 z-50 flex max-h-[92vh] flex-col overflow-y-auto rounded-t-[26px] border-t border-border-subtle bg-surface-1 shadow-sheet animate-sheet-up ${className}`}
        style={{
          padding: "20px 20px 32px",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Zona de arraste: drag handle + cabeçalho */}
        <div
          data-testid="bottom-sheet-drag"
          onTouchStart={onDragStart}
          onTouchMove={onDragMove}
          onTouchEnd={onDragEnd}
          onTouchCancel={onDragCancel}
          className="cursor-grab touch-none select-none active:cursor-grabbing"
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
        </div>

        {/* Content */}
        {children}
      </div>
    </div>
  );
}

export default BottomSheet;
