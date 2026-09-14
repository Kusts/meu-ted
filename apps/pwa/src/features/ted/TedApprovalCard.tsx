"use client";

import { useState } from "react";
import { decidePendingOperation, type PendingOperationDecision } from "@/lib/api/agent-client";

export type TedPendingOperation = Readonly<{
  id: string;
  status: "proposed" | "succeeded" | "failed" | "cancelled" | "expired";
  operation: string;
  summary?: string;
}>;

interface TedApprovalCardProps {
  operation: TedPendingOperation;
  workspaceId: string;
  onResolved?: () => void;
}

export function TedApprovalCard({ operation, workspaceId, onResolved }: TedApprovalCardProps) {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<TedPendingOperation["status"]>(operation.status);
  const [error, setError] = useState<string | null>(null);
  const operationLabel = operation.summary || operation.operation || "operação financeira";

  const resolve = async (decision: "confirm" | "cancel" | "retry") => {
    const resolved: PendingOperationDecision = await decidePendingOperation(workspaceId, operation.id, decision);
    setStatus(resolved.status);
    onResolved?.();
  };

  const handleApprove = async () => {
    setLoading(true);
    setError(null);
    try {
      await resolve("confirm");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async () => {
    setLoading(true);
    setError(null);
    try {
      await resolve("cancel");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  if (status === "failed") {
    return (
      <div className="my-2 rounded-[14px] border border-danger/30 bg-danger-tint p-3 text-xs text-danger">
        <strong>Não foi possível concluir a operação.</strong>
        {error && <div className="mt-1">{error}</div>}
        <button type="button" disabled={loading} onClick={async () => { setLoading(true); setError(null); try { await resolve("retry"); } catch (e) { setError((e as Error).message); } finally { setLoading(false); } }} className="mt-2 rounded-[10px] border border-danger/30 px-3 py-2 font-bold disabled:opacity-50">{loading ? "Tentando…" : "Tentar novamente"}</button>
      </div>
    );
  }
  if (!["proposed"].includes(status)) {
    return (
      <div className="my-2 rounded-[14px] border border-border-subtle bg-surface-2 p-3 text-xs text-text-secondary">
        Operação {status === "succeeded" ? "✅ registrada" : status === "cancelled" ? "❌ cancelada" : `⏳ ${status}`}: <strong className="text-text-primary">{operationLabel}</strong>
      </div>
    );
  }

  return (
    <div className="my-2 rounded-[16px] border border-warning/30 bg-warning-tint p-3.5 text-xs shadow-xs">
      <div className="font-bold text-warning">⚠️ Confirmação Necessária</div>
      <div className="mt-1 text-text-primary">
        Ação: <strong>{operationLabel}</strong>
      </div>
      <div className="mt-0.5 text-text-muted">Revise os dados antes de confirmar a ação.</div>

      {error && <div className="mt-1 font-semibold text-danger">{error}</div>}

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={loading}
          onClick={handleApprove}
          className="rounded-[10px] bg-primary px-3.5 py-2 font-bold text-white shadow-xs transition-all hover:bg-primary-hover active:scale-95 disabled:opacity-50"
        >
          {loading ? "Processando…" : "Aprovar"}
        </button>
        <button
          type="button"
          disabled={loading}
          onClick={handleReject}
          className="rounded-[10px] border border-border-subtle bg-surface-1 px-3.5 py-2 font-bold text-text-secondary transition-all hover:bg-surface-2 active:scale-95 disabled:opacity-50"
        >
          Rejeitar
        </button>
      </div>
    </div>
  );
}
