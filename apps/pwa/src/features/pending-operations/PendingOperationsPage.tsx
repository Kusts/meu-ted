"use client";

import { useState } from "react";
import StatusBar from "@/components/StatusBar";
import PageHeader from "@/components/PageHeader";
import { undoLastAction } from "@/lib/api/endpoints";
import { ApiError } from "@/lib/api/client";
import { ShieldCheck, Undo2 } from "lucide-react";

export default function PendingOperationsPage() {
  const [undoLoading, setUndoLoading] = useState(false);
  const [undoResult, setUndoResult] = useState<string | null>(null);
  const [undoError, setUndoError] = useState<string | null>(null);

  const handleUndo = async () => {
    setUndoLoading(true);
    setUndoError(null);
    setUndoResult(null);
    try {
      const res = await undoLastAction();
      setUndoResult(`Desfeito: ${res.undone.operation} (${res.undone.reversal})`);
    } catch (error) {
      setUndoError(error instanceof ApiError || error instanceof Error ? error.message : "Falha ao desfazer");
    } finally {
      setUndoLoading(false);
    }
  };

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <StatusBar />
      <PageHeader title="Aprovações" />

      <main className="flex flex-1 flex-col gap-3 px-5 pb-[var(--tab-bar-height)] sm:px-8 lg:px-12">
        <section
          data-testid="pending-v2-info"
          className="flex flex-1 flex-col items-center justify-center py-16 text-center"
        >
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-surface-2 text-text-muted shadow-xs">
            <ShieldCheck size={26} strokeWidth={2} />
          </div>
          <h2 className="text-[15px] font-bold text-text-primary">Aprovações são concluídas no TED</h2>
          <p className="mt-1 max-w-[300px] text-[12px] leading-relaxed text-text-muted">
            Quando uma ação exigir confirmação, revise e decida no cartão seguro da conversa com o TED.
          </p>
        </section>

        <section className="flex flex-col gap-2" aria-label="Desfazer última ação">
          <button
            type="button"
            onClick={() => void handleUndo()}
            disabled={undoLoading}
            data-testid="undo-last-action"
            className="flex w-full items-center justify-center gap-2 rounded-[14px] border border-border-subtle bg-surface-1 px-4 py-3 text-[13px] font-bold text-text-primary shadow-xs transition-all hover:bg-surface-2 active:scale-[0.99] disabled:opacity-60"
          >
            <Undo2 size={16} />
            {undoLoading ? "Desfazendo…" : "Desfazer última ação"}
          </button>
          {undoResult && (
            <div className="rounded-[12px] bg-primary-tint px-4 py-2.5 text-[12px] font-bold text-primary" data-testid="undo-success">
              ✓ {undoResult}
            </div>
          )}
          {undoError && (
            <div className="rounded-[12px] bg-danger-tint px-4 py-2.5 text-[12px] font-semibold text-danger" data-testid="undo-error">
              ⚠ {undoError}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
