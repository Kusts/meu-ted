"use client";

import { useState } from "react";
import { approvePendingOperation, rejectPendingOperation, type PendingOperation } from "@/lib/api/agent-client";

interface TedApprovalCardProps {
  operation: PendingOperation;
  workspaceId: string;
  onResolved?: () => void;
}

export function TedApprovalCard({ operation, workspaceId, onResolved }: TedApprovalCardProps) {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string>(operation.status);
  const [error, setError] = useState<string | null>(null);

  const handleApprove = async () => {
    setLoading(true);
    setError(null);
    try {
      await approvePendingOperation(workspaceId, operation.id);
      setStatus("approved");
      onResolved?.();
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
      await rejectPendingOperation(workspaceId, operation.id);
      setStatus("rejected");
      onResolved?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  if (status !== "pending") {
    return (
      <div className="my-2 rounded-[14px] border border-border-subtle bg-surface-2 p-3 text-xs text-text-secondary">
        Operação {status === "approved" ? "✅ aprovada" : "❌ rejeitada"}: <strong className="text-text-primary">{operation.operation}</strong>
      </div>
    );
  }

  return (
    <div className="my-2 rounded-[16px] border border-warning/30 bg-warning-tint p-3.5 text-xs shadow-xs">
      <div className="font-bold text-warning">⚠️ Confirmação Necessária</div>
      <div className="mt-1 text-text-primary">
        Ação: <strong>{operation.operation}</strong>
      </div>
      <div className="mt-0.5 text-text-muted">Motivo: {operation.reason === "high_value" ? "Valor elevado" : "Ação destrutiva"}</div>

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
