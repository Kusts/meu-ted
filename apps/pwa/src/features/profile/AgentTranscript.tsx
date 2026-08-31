"use client";

import { useEffect, useState } from "react";
import BottomSheet from "@/components/BottomSheet";
import {
  fetchAgentHistory,
  fetchPendingOperations,
  approvePendingOperation,
  rejectPendingOperation,
  sendAgentMessage,
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
  const [historyError, setHistoryError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    fetchAgentHistory(workspaceId)
      .then((items) => {
        if (cancelled) return;
        setMessages(items);
        setHistoryError(null);
      })
      .catch(() => {
        if (cancelled) return;
        setMessages([]);
        setHistoryError("Não foi possível carregar o histórico.");
      });
    fetchPendingOperations(workspaceId)
      .then((ops) => {
        if (!cancelled) setPendingOps(ops);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [open, workspaceId]);

  const handleSend = async () => {
    if (!inputText.trim() || loading) return;
    const text = inputText.trim();
    setInputText("");
    setLoading(true);

    try {
      await sendAgentMessage(workspaceId, text);
      const [history, ops] = await Promise.all([
        fetchAgentHistory(workspaceId),
        fetchPendingOperations(workspaceId).catch(() => []),
      ]);
      setMessages(history);
      setPendingOps(ops);
    } catch {
      try {
        const history = await fetchAgentHistory(workspaceId);
        setMessages(history);
        setHistoryError(null);
      } catch {
        setMessages([]);
        setHistoryError("Não foi possível carregar o histórico.");
      }
    } finally {
      setLoading(false);
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
      {pendingOps.map((op) => (
        <div key={op.id} className="p-3 mb-2 bg-amber-500/10 rounded-lg border border-amber-500/20">
          <p className="font-semibold text-sm">Aprovação necessária</p>
          <div className="flex gap-2 mt-2">
            <button onClick={() => handleApprove(op.id)} className="px-3 py-1 bg-primary text-white text-xs rounded cursor-pointer">
              Aprovar
            </button>
            <button onClick={() => handleReject(op.id)} className="px-3 py-1 bg-surface text-xs rounded cursor-pointer">
              Rejeitar
            </button>
          </div>
        </div>
      ))}

      {historyError && (
        <p role="alert" className="rounded-[10px] bg-danger-tint px-3 py-2 text-[12px] font-semibold text-danger">
          {historyError}
        </p>
      )}

      <div className="space-y-3 my-4 max-h-80 overflow-y-auto">
        {messages.map((m) => {
          const isCurrentUser = m.isOwn;
          const isAssistant = m.role === "assistant";
          const displayName = isCurrentUser ? "Você" : isAssistant ? "TED" : "Membro";
          return (
            <div
              key={m.id}
              className={`p-2 rounded-lg ${
                isCurrentUser ? "bg-surface" : isAssistant ? "bg-primary/10" : "bg-surface-2"
              }`}
            >
              <span className="text-xs text-text-secondary font-semibold">{displayName}</span>
              <p className="text-sm text-text-primary">{m.content}</p>
            </div>
          );
        })}
      </div>

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
          className="px-4 py-2 bg-primary text-white text-sm rounded-lg cursor-pointer disabled:opacity-50"
        >
          Enviar
        </button>
      </div>
    </BottomSheet>
  );
}
