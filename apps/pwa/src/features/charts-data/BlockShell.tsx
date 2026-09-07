"use client";

import type { ReactNode } from "react";
import { ArrowDown, ArrowUp, Eye, EyeOff } from "lucide-react";

/**
 * Moldura padrão dos blocos de analytics: cartão, título, controles de
 * edição (ocultar/mover), skeleton de carregamento. Erro e vazio ficam a
 * cargo da zona (erro com retry) e do conteúdo (BlockEmpty).
 */
export function BlockShell({
  title,
  testId,
  editMode = false,
  hidden = false,
  disableUp = false,
  disableDown = false,
  onToggleHidden,
  onMoveUp,
  onMoveDown,
  children,
}: {
  title: string;
  testId: string;
  editMode?: boolean;
  hidden?: boolean;
  disableUp?: boolean;
  disableDown?: boolean;
  onToggleHidden?: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  children: ReactNode;
}) {
  return (
    <section
      aria-label={title}
      data-testid={testId}
      data-hidden={hidden || undefined}
      className="rounded-[16px] border border-border-subtle bg-surface-1 px-4 py-4 shadow-card"
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-[13px] font-bold text-text-primary">{title}</h3>
        {editMode && (
          <div className="flex flex-none items-center gap-1" role="group" aria-label={`Editar ${title}`}>
            <button
              type="button"
              onClick={onMoveUp}
              disabled={disableUp}
              aria-label={`Mover ${title} para cima`}
              className="rounded-[8px] p-1.5 text-text-muted transition-colors hover:bg-surface-2 hover:text-text-primary disabled:opacity-30"
            >
              <ArrowUp size={14} />
            </button>
            <button
              type="button"
              onClick={onMoveDown}
              disabled={disableDown}
              aria-label={`Mover ${title} para baixo`}
              className="rounded-[8px] p-1.5 text-text-muted transition-colors hover:bg-surface-2 hover:text-text-primary disabled:opacity-30"
            >
              <ArrowDown size={14} />
            </button>
            <button
              type="button"
              onClick={onToggleHidden}
              aria-pressed={!hidden}
              aria-label={hidden ? `Mostrar ${title}` : `Ocultar ${title}`}
              className="rounded-[8px] p-1.5 text-text-muted transition-colors hover:bg-surface-2 hover:text-text-primary"
            >
              {hidden ? <Eye size={14} /> : <EyeOff size={14} />}
            </button>
          </div>
        )}
      </div>
      {hidden && editMode ? (
        <p className="py-2 text-center text-[12px] font-medium text-text-muted">Bloco oculto.</p>
      ) : (
        children
      )}
    </section>
  );
}

export function BlockSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div aria-hidden="true" className="flex flex-col gap-2">
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="h-9 animate-pulse rounded-[10px] bg-surface-2 motion-reduce:animate-none"
          style={{ opacity: 1 - i * 0.18 }}
        />
      ))}
      <span className="sr-only">Carregando gráficos</span>
    </div>
  );
}

export function BlockEmpty({ message, hint }: { message: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center gap-1 py-5 text-center">
      <p className="text-[12px] font-semibold text-text-muted">{message}</p>
      {hint && <p className="max-w-[240px] text-[11px] font-medium text-text-muted/80">{hint}</p>}
    </div>
  );
}

export function ZoneError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-2.5 rounded-[16px] border border-danger/30 bg-danger-tint px-4 py-5 text-center"
    >
      <p className="text-[12px] font-semibold text-danger">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="rounded-full bg-danger px-4 py-2 text-[12px] font-bold text-white transition-all active:scale-[0.98]"
      >
        Tentar de novo
      </button>
    </div>
  );
}
