"use client";

import { useRef, useState } from "react";
import { decideUndoProposal, type UndoDecision } from "@/lib/api/agent-client";

export type TedUndoProposal = Readonly<{
  requestId: string;
  status: "proposed" | "executing";
  expiresAt: string;
}>;

interface TedUndoCardProps {
  proposal: TedUndoProposal;
  workspaceId: string;
  /** Receives the authoritative decision (confirmed/cancelled) for chat-level refresh. */
  onResolved?: (decision: UndoDecision) => void;
}

const DECISION_ERROR = "Não foi possível registrar a decisão. Tente novamente.";

/** pt-BR short date-time for the expiry line; unknown shapes pass through raw. */
function formatExpiry(expiresAt: string): string {
  const time = Date.parse(expiresAt);
  if (Number.isNaN(time)) return expiresAt;
  return new Date(time).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function TedUndoCard({ proposal, workspaceId, onResolved }: TedUndoCardProps) {
  const [outcome, setOutcome] = useState<"proposed" | "confirmed" | "cancelled">("proposed");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Local single-decision guard: once the server confirms a terminal state,
  // this card never issues another RPC (server CAS is the authority; this
  // only stops a duplicate click from leaving the browser).
  const decidedRef = useRef(false);
  const inFlightRef = useRef(false);

  const decide = async (decision: "confirm" | "cancel") => {
    if (decidedRef.current || inFlightRef.current) return;
    inFlightRef.current = true;
    setLoading(true);
    setError(null);
    try {
      // The ONLY path that decides: explicit card button → authenticated RPC
      // naming the proposal (requestId) and the decision. Model text is never
      // parsed or acted on here.
      const result = await decideUndoProposal(workspaceId, proposal.requestId, decision);
      decidedRef.current = true;
      setOutcome(result.status === "confirmed" ? "confirmed" : "cancelled");
      onResolved?.(result);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : DECISION_ERROR);
    } finally {
      inFlightRef.current = false;
      setLoading(false);
    }
  };

  const handleConfirm = () => void decide("confirm");
  const handleCancel = () => void decide("cancel");

  if (outcome === "confirmed") {
    return (
      <div
        role="status"
        data-testid="ted-undo-confirmed"
        className="my-2 rounded-[14px] border border-border-subtle bg-surface-2 p-3 text-xs text-text-secondary"
      >
        ✅ Ação desfeita.
      </div>
    );
  }

  if (outcome === "cancelled") {
    return (
      <div
        role="status"
        data-testid="ted-undo-cancelled"
        className="my-2 rounded-[14px] border border-border-subtle bg-surface-2 p-3 text-xs text-text-secondary"
      >
        ❌ Desfazer cancelado — nada foi alterado.
      </div>
    );
  }

  // debt-undo-proposal-rehydration: a rehydrated `executing` proposal is
  // truthfully in-flight (confirm claim persisted, effect owned by the
  // server). The card shows the pending state with NO buttons and issues NO
  // RPC — rehydration never decides; a retry converges via the card's own
  // confirm only while `proposed`.
  if (proposal.status === "executing" && outcome === "proposed") {
    return (
      <div
        role="status"
        data-testid="ted-undo-pending"
        className="my-2 rounded-[14px] border border-border-subtle bg-surface-2 p-3 text-xs text-text-secondary"
      >
        ⏳ Desfazer em andamento — aguarde a confirmação do servidor.
      </div>
    );
  }

  return (
    <div
      data-testid="ted-undo-card"
      className="my-2 rounded-[16px] border border-warning/30 bg-warning-tint p-3.5 text-xs shadow-xs"
    >
      <div className="font-bold text-warning">↩️ Desfazer última ação</div>
      <div className="mt-1 text-sm font-semibold text-text-primary">
        Desfazer a última ação registrada.
      </div>
      <div className="mt-0.5 text-text-muted">
        Confira antes de confirmar — esta ação não pode ser refeita automaticamente. Válido até{" "}
        {formatExpiry(proposal.expiresAt)}.
      </div>

      {error && (
        <div role="alert" className="mt-1 font-semibold text-danger">
          {error}
        </div>
      )}

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={loading}
          onClick={handleConfirm}
          className="rounded-[10px] bg-primary px-3.5 py-2 font-bold text-white shadow-xs transition-all hover:bg-primary-hover active:scale-95 disabled:opacity-50"
        >
          {loading ? "Processando…" : "Confirmar desfazer"}
        </button>
        <button
          type="button"
          disabled={loading}
          onClick={handleCancel}
          className="rounded-[10px] border border-border-subtle bg-surface-1 px-3.5 py-2 font-bold text-text-secondary transition-all hover:bg-surface-2 active:scale-95 disabled:opacity-50"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
