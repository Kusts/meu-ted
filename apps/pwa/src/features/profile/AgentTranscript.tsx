"use client";

import { useEffect, useState } from "react";
import BottomSheet from "@/components/BottomSheet";
import {
  fetchAgentHistory,
  exportAgentHistory,
  deleteAgentHistory,
  fetchPendingOperations,
  approvePendingOperation,
  rejectPendingOperation,
  sendAgentMessage,
  processAgentTurn,
  reconnectAgentTurn,
  retryAgentTurn,
  type AgentMessage,
  type PendingOperation,
} from "@/lib/api/agent-client";

export interface AgentTranscriptProps {
  open: boolean;
  workspaceId: string;
  onClose?: () => void;
}

export function AgentTranscript({ open, workspaceId, onClose = () => {} }: AgentTranscriptProps) {
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [pendingOps, setPendingOps] = useState<PendingOperation[]>([]);
  const [inputText, setInputText] = useState("");
  const [loading, setLoading] = useState(false);
  const [failedTurnId, setFailedTurnId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    fetchAgentHistory(workspaceId)
      .then((items) => setMessages(items))
      .catch(() => {});
    fetchPendingOperations(workspaceId)
      .then((ops) => setPendingOps(ops))
      .catch(() => {});
  }, [open, workspaceId]);

  const handleSend = async () => {
    if (!inputText.trim() || loading) return;
    const text = inputText.trim();
    setInputText("");
    setLoading(true);
    setFailedTurnId(null);

    try {
      const turn = await sendAgentMessage(workspaceId, text);
      let output: string | undefined;

      try {
        const processed = await processAgentTurn(workspaceId, turn.turnId);
        if (processed.status === "failed") {
          setFailedTurnId(turn.turnId);
          await reconnectAgentTurn(workspaceId, turn.turnId);
          return;
        }
        output = processed.output;
      } catch {
        // network loss -> recover via stream
        const events = await reconnectAgentTurn(workspaceId, turn.turnId);
        for (const ev of events) {
          try {
            const parsed = JSON.parse(ev.data);
            if (parsed.output) output = parsed.output;
          } catch {}
        }
      }

      await reconnectAgentTurn(workspaceId, turn.turnId);

      if (output) {
        setMessages((prev) => [
          ...prev,
          { id: `turn-${Date.now()}`, actorId: "assistant", role: "assistant", content: output! },
        ]);
      }
    } catch {
      // ignore error in handler
    } finally {
      setLoading(false);
    }
  };

  const handleRetry = async () => {
    if (!failedTurnId) return;
    const turnId = failedTurnId;
    setLoading(true);
    try {
      await retryAgentTurn(workspaceId, turnId);
      const processed = await processAgentTurn(workspaceId, turnId);
      await reconnectAgentTurn(workspaceId, turnId);
      if (processed.output) {
        setMessages((prev) => [
          ...prev,
          { id: `turn-${Date.now()}`, actorId: "assistant", role: "assistant", content: processed.output! },
        ]);
        setFailedTurnId(null);
      }
    } catch {} finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    await exportAgentHistory(workspaceId);
  };

  const handleDelete = async () => {
    if (window.confirm("Deseja realmente excluir seu histórico?")) {
      await deleteAgentHistory(workspaceId);
      setMessages([]);
    }
  };

  const handleApprove = async (opId: string) => {
    await approvePendingOperation(workspaceId, opId);
    setPendingOps((prev) => prev.filter((o) => o.id !== opId));
  };

  const handleReject = async (opId: string) => {
    await rejectPendingOperation(workspaceId, opId);
    setPendingOps((prev) => prev.filter((o) => o.id !== opId));
  };

  return (
    <BottomSheet open={open} onClose={onClose} title="Histórico do Assistente">
      <div className="flex gap-2 mb-4">
        <button onClick={handleExport} className="text-xs px-2 py-1 bg-fill-light rounded">
          Exportar histórico
        </button>
        <button onClick={handleDelete} className="text-xs px-2 py-1 text-red-500 rounded">
          Excluir meu histórico
        </button>
      </div>

      {pendingOps.map((op) => (
        <div key={op.id} className="p-3 mb-2 bg-amber-500/10 rounded-lg border border-amber-500/20">
          <p className="font-semibold text-sm">Aprovação necessária</p>
          <div className="flex gap-2 mt-2">
            <button onClick={() => handleApprove(op.id)} className="px-3 py-1 bg-primary text-white text-xs rounded">
              Aprovar
            </button>
            <button onClick={() => handleReject(op.id)} className="px-3 py-1 bg-surface text-xs rounded">
              Rejeitar
            </button>
          </div>
        </div>
      ))}

      <div className="space-y-3 my-4 max-h-80 overflow-y-auto">
        {messages.map((m) => (
          <div key={m.id} className={`p-2 rounded-lg ${m.role === "user" ? "bg-surface" : "bg-primary/10"}`}>
            <span className="text-xs text-text-secondary font-mono">{m.actorId}</span>
            <p className="text-sm text-text-primary">{m.content}</p>
          </div>
        ))}
      </div>

      {failedTurnId && (
        <div className="my-2">
          <button onClick={handleRetry} className="text-xs text-amber-500 underline">
            Tentar novamente
          </button>
        </div>
      )}

      <div className="flex gap-2 mt-4">
        <input
          type="text"
          aria-label="Mensagem do agente"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Digite sua mensagem..."
          className="flex-1 px-3 py-2 text-sm rounded-lg border bg-surface"
        />
        <button
          onClick={handleSend}
          disabled={loading}
          className="px-4 py-2 bg-primary text-white text-sm rounded-lg"
        >
          Enviar
        </button>
      </div>
    </BottomSheet>
  );
}
