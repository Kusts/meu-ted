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
      <div className="my-2 rounded-xl border border-border bg-bg-surface p-3 text-xs text-text-secondary">
        Operação {status === "approved" ? "✅ aprovada" : "❌ rejeitada"}: <strong className="text-text-primary">{operation.operation}</strong>
      </div>
    );
  }

  return (
    <div className="my-2 rounded-xl border border-warning/40 bg-warning/5 p-3 text-xs">
      <div className="font-semibold text-warning-dark">⚠️ Confirmação Necessária</div>
      <div className="mt-1 text-text-primary">
        Ação: <strong>{operation.operation}</strong>
      </div>
      <div className="mt-0.5 text-text-muted">Motivo: {operation.reason === "high_value" ? "Valor elevado" : "Ação destrutiva"}</div>

      {error && <div className="mt-1 text-danger">{error}</div>}

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={loading}
          onClick={handleApprove}
          className="rounded-lg bg-primary px-3 py-1.5 font-medium text-white transition hover:bg-primary-dark disabled:opacity-50"
        >
          {loading ? "Processando…" : "Aprovar"}
        </button>
        <button
          type="button"
          disabled={loading}
          onClick={handleReject}
          className="rounded-lg border border-border bg-bg-surface px-3 py-1.5 font-medium text-text-secondary transition hover:bg-fill-light disabled:opacity-50"
        >
          Rejeitar
        </button>
      </div>
    </div>
  );
}
