"use client";

import { useCallback, useEffect, useState } from "react";
import StatusBar from "@/components/StatusBar";
import PageHeader from "@/components/PageHeader";
import { ConfirmActionDialog } from "@/components/ConfirmActionDialog";
import {
  fetchPendingOperations,
  approvePendingOperation,
  rejectPendingOperation,
  undoLastAction,
} from "@/lib/api/endpoints";
import type { PendingOperation } from "@/lib/state/types";
import { ApiError, isApiConfigured } from "@/lib/api/client";
import { ShieldCheck, Undo2, RotateCw } from "lucide-react";

function formatBRL(cents: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

function reasonLabel(reason: PendingOperation["reason"]): string {
  return reason === "high_value" ? "Valor alto" : "Ação destrutiva";
}

function reasonColor(reason: PendingOperation["reason"]): string {
  return reason === "high_value" ? "var(--color-warning)" : "var(--color-danger)";
}

function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}

function payloadPreview(payload: unknown): string {
  if (!payload || typeof payload !== "object") return String(payload ?? "");
  const obj = payload as Record<string, unknown>;
  const parts: string[] = [];
  if (typeof obj.description === "string") parts.push(obj.description);
  if (typeof obj.amountCents === "number") parts.push(formatBRL(obj.amountCents));
  if (typeof obj.totalAmountCents === "number") parts.push(formatBRL(obj.totalAmountCents));
  if (typeof obj.name === "string") parts.push(obj.name);
  if (parts.length > 0) return parts.join(" · ");
  try {
    const json = JSON.stringify(payload);
    return json.length > 120 ? json.slice(0, 120) + "…" : json;
  } catch {
    return String(payload);
  }
}

function expiresInLabel(expiresAt: string): string {
  const diff = Date.parse(expiresAt) - Date.now();
  if (diff <= 0) return "Expirada";
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `expira em ${mins} min`;
  const hours = Math.floor(mins / 60);
  const rem = mins % 60;
  return `expira em ${hours}h ${rem}min`;
}

export default function PendingOperationsPage() {
  const [items, setItems] = useState<PendingOperation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);
  const [confirmApprove, setConfirmApprove] = useState<PendingOperation | null>(null);
  const [confirmReject, setConfirmReject] = useState<PendingOperation | null>(null);
  const [undoLoading, setUndoLoading] = useState(false);
  const [undoResult, setUndoResult] = useState<string | null>(null);
  const [undoError, setUndoError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isApiConfigured()) {
      setLoading(false);
      setError(null);
      setItems([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await fetchPendingOperations("pending");
      setItems(data);
    } catch (e) {
      if (e instanceof ApiError) setError(e.message);
      else if (e instanceof Error) setError(e.message);
      else setError("Falha ao carregar operações pendentes");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const handleApprove = async (op: PendingOperation) => {
    setActionId(op.id);
    setError(null);
    try {
      await approvePendingOperation(op.id);
      setItems((prev) => prev.filter((p) => p.id !== op.id));
    } catch (e) {
      if (e instanceof ApiError) setError(e.message);
      else if (e instanceof Error) setError(e.message);
    } finally {
      setActionId(null);
      setConfirmApprove(null);
    }
  };

  const handleReject = async (op: PendingOperation) => {
    setActionId(op.id);
    setError(null);
    try {
      await rejectPendingOperation(op.id);
      setItems((prev) => prev.filter((p) => p.id !== op.id));
    } catch (e) {
      if (e instanceof ApiError) setError(e.message);
      else if (e instanceof Error) setError(e.message);
    } finally {
      setActionId(null);
      setConfirmReject(null);
    }
  };

  const handleUndo = async () => {
    setUndoLoading(true);
    setUndoError(null);
    setUndoResult(null);
    try {
      const res = await undoLastAction();
      setUndoResult(`Desfeito: ${res.undone.operation} (${res.undone.reversal})`);
      await load();
    } catch (e) {
      if (e instanceof ApiError) setUndoError(e.message);
      else if (e instanceof Error) setUndoError(e.message);
      else setUndoError('Falha ao desfazer');
    } finally {
      setUndoLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-dvh flex-col bg-bg">
        <StatusBar />
        <PageHeader title="Aprovações pendentes" />
        <div className="flex flex-1 items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-border-subtle border-t-primary" />
            <span className="text-[13px] font-semibold text-text-muted">Carregando...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <StatusBar />
      <PageHeader
        title="Aprovações pendentes"
        subtitle={items.length > 0 ? `${items.length} pendente${items.length !== 1 ? "s" : ""}` : undefined}
      />

      <main className="flex flex-1 flex-col gap-3 px-5 pb-[var(--tab-bar-height)] sm:px-8 lg:px-12">
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => void handleUndo()}
            disabled={undoLoading}
            data-testid="undo-last-action"
            className="flex items-center justify-center gap-2 w-full rounded-[14px] border border-border-subtle bg-surface-1 px-4 py-3 text-[13px] font-bold text-text-primary shadow-xs hover:bg-surface-2 transition-all active:scale-[0.99] disabled:opacity-60"
          >
            <Undo2 size={16} />
            {undoLoading ? 'Desfazendo…' : 'Desfazer última ação'}
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
        </div>

        {!isApiConfigured() && (
          <div className="rounded-[14px] border border-warning/30 bg-warning-tint px-4 py-3 text-[12px] font-semibold text-warning">
            API não configurada — modo demonstração. Nenhuma operação pendente real.
          </div>
        )}

        {error && (
          <div className="rounded-[12px] bg-danger-tint px-4 py-2.5 text-[12px] font-semibold text-danger" data-testid="pending-error">
            ⚠ {error}
          </div>
        )}

        {items.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center py-16 text-center" data-testid="pending-empty">
            <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-surface-2 text-text-muted shadow-xs">
              <ShieldCheck size={26} strokeWidth={2} />
            </div>
            <div className="text-[15px] font-bold text-text-primary">Nenhuma operação pendente</div>
            <div className="mt-1 max-w-[280px] text-[12px] leading-relaxed text-text-muted">
              Operações que exigem confirmação (valor alto ou ação destrutiva) aparecerão aqui para aprovação no seu workspace.
            </div>
            <button
              type="button"
              onClick={() => void load()}
              className="mt-4 rounded-full bg-surface-2 border border-border-subtle px-4 py-2 text-[12px] font-bold text-text-secondary hover:bg-surface-3 transition-colors flex items-center gap-1.5"
            >
              <RotateCw size={14} />
              Atualizar
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3" data-testid="pending-list">
            {items.map((op) => {
              const isActing = actionId === op.id;
              return (
                <div
                  key={op.id}
                  data-testid="pending-card"
                  className="rounded-[18px] border border-border-subtle bg-surface-1 px-4 py-4 shadow-card"
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span
                      className="rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white shadow-2xs"
                      style={{ background: reasonColor(op.reason) }}
                    >
                      {reasonLabel(op.reason)}
                    </span>
                    <span className="text-[11px] font-medium text-text-muted" title={op.expiresAt}>
                      {expiresInLabel(op.expiresAt)}
                    </span>
                  </div>

                  <div className="text-[14px] font-bold text-text-primary">{op.operation}</div>
                  <div className="mt-1 text-[12px] leading-relaxed text-text-secondary">{payloadPreview(op.payload)}</div>

                  <div className="mt-2 flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-text-muted">
                    <span>Criada em {formatDateTime(op.createdAt)}</span>
                    <span>·</span>
                    <span>Expira em {formatDateTime(op.expiresAt)}</span>
                    {op.chatId && (
                      <>
                        <span>·</span>
                        <span>chat {op.chatId.slice(0, 8)}…</span>
                      </>
                    )}
                  </div>

                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => setConfirmReject(op)}
                      disabled={isActing}
                      data-testid={`reject-${op.id}`}
                      className="flex-1 rounded-[12px] border border-danger/30 bg-danger-tint py-2.5 text-[13px] font-bold text-danger hover:bg-danger-tint/80 active:scale-[0.98] transition-all disabled:opacity-60"
                    >
                      {isActing ? "…" : "Cancelar"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmApprove(op)}
                      disabled={isActing}
                      data-testid={`approve-${op.id}`}
                      className="flex-1 rounded-[12px] bg-primary py-2.5 text-[13px] font-bold text-white shadow-xs hover:bg-primary-hover active:scale-[0.98] transition-all disabled:opacity-60"
                    >
                      {isActing ? "Processando…" : "Confirmar"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {items.length > 0 && (
          <button
            type="button"
            onClick={() => void load()}
            className="mx-auto mt-2 rounded-full bg-surface-2 border border-border-subtle px-4 py-2 text-[12px] font-bold text-text-secondary hover:bg-surface-3 transition-colors flex items-center gap-1.5"
          >
            <RotateCw size={14} />
            Atualizar lista
          </button>
        )}
      </main>

      <ConfirmActionDialog
        open={confirmApprove !== null}
        title="Confirmar operação?"
        message={`Confirmar "${confirmApprove?.operation ?? ""}"? Esta ação executará a operação pendente.`}
        confirmLabel="Sim, confirmar"
        cancelLabel="Voltar"
        onConfirm={() => confirmApprove && void handleApprove(confirmApprove)}
        onCancel={() => setConfirmApprove(null)}
      />

      <ConfirmActionDialog
        open={confirmReject !== null}
        title="Cancelar operação?"
        message={`Cancelar "${confirmReject?.operation ?? ""}"? A operação será rejeitada.`}
        confirmLabel="Sim, cancelar"
        cancelLabel="Voltar"
        danger
        onConfirm={() => confirmReject && void handleReject(confirmReject)}
        onCancel={() => setConfirmReject(null)}
      />
    </div>
  );
}
