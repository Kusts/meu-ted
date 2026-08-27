import { useState, useEffect, useRef, useCallback } from "react";
import { useWorkspaceSafe } from "@/lib/auth/workspace-context";
import { fetchAgentConnectionToken } from "@/lib/api/agent-auth";
import {
  fetchAgentHistory,
  sendAgentMessage,
  exportAgentHistory,
  deleteAgentHistory,
  fetchPendingOperations,
  type AgentMessage,
  type PendingOperation,
} from "@/lib/api/agent-client";
import { TedMessage } from "./TedMessage";
import { TedApprovalCard } from "./TedApprovalCard";

interface TedChatProps {
  open: boolean;
  onClose: () => void;
}

export function TedChat({ open, onClose }: TedChatProps) {
  const ws = useWorkspaceSafe();
  const activeWorkspace = ws?.activeWorkspace ?? null;
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [pendingOps, setPendingOps] = useState<PendingOperation[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"connecting" | "ready" | "streaming" | "error">("ready");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  const loadHistory = useCallback(async () => {
    if (!activeWorkspace) return;
    try {
      setStatus("connecting");
      await fetchAgentConnectionToken(activeWorkspace.id);
      const [history, ops] = await Promise.all([
        fetchAgentHistory(activeWorkspace.id).catch(() => []),
        fetchPendingOperations(activeWorkspace.id).catch(() => []),
      ]);
      setMessages(history);
      setPendingOps(ops);
      setStatus("ready");
    } catch (e) {
      setError((e as Error).message);
      setStatus("error");
    }
  }, [activeWorkspace]);

  useEffect(() => {
    if (open && activeWorkspace) {
      void loadHistory();
    }
  }, [open, activeWorkspace, loadHistory]);

  useEffect(() => {
    if (typeof messagesEndRef.current?.scrollIntoView === "function") {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, pendingOps]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !activeWorkspace || loading) return;

    const userText = input.trim();
    setInput("");
    setLoading(true);
    setError(null);
    setStatus("streaming");

    const optimisticMsg: AgentMessage = {
      id: `opt-${Date.now()}`,
      actorId: "me",
      role: "user",
      content: userText,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticMsg]);

    try {
      const turn = await sendAgentMessage(activeWorkspace.id, userText);
      if (turn.output) {
        const assistantMsg: AgentMessage = {
          id: `resp-${Date.now()}`,
          actorId: "agent",
          role: "assistant",
          content: turn.output,
          createdAt: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, assistantMsg]);
      }
      // Refresh pending operations
      const ops = await fetchPendingOperations(activeWorkspace.id).catch(() => []);
      setPendingOps(ops);
      setStatus("ready");
    } catch (err) {
      setError((err as Error).message);
      setStatus("error");
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    if (!activeWorkspace) return;
    try {
      const exp = await exportAgentHistory(activeWorkspace.id);
      const blob = new Blob([JSON.stringify(exp, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ted-chat-export-${activeWorkspace.id}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const handleClear = async () => {
    if (!activeWorkspace) return;
    if (!window.confirm("Deseja limpar seu histórico neste workspace?")) return;
    try {
      await deleteAgentHistory(activeWorkspace.id);
      setMessages([]);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Chat com TED"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm sm:bottom-20 sm:inset-auto sm:right-6 sm:w-[420px] sm:h-[620px] sm:bg-transparent"
    >
      <div
        ref={modalRef}
        className="flex h-[92dvh] w-full flex-col rounded-t-3xl border border-border bg-bg-surface shadow-2xl sm:h-full sm:rounded-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-sm">
              TED
            </div>
            <div>
              <div className="text-sm font-bold text-text-primary">TED · Assistente</div>
              <div className="text-[11px] text-text-muted">
                {activeWorkspace ? activeWorkspace.name : "Workspace"}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleExport}
              title="Exportar histórico"
              aria-label="Exportar histórico"
              className="rounded-lg p-1.5 text-text-muted hover:bg-fill-light hover:text-text-primary"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            </button>
            <button
              type="button"
              onClick={handleClear}
              title="Limpar meu histórico"
              aria-label="Limpar meu histórico"
              className="rounded-lg p-1.5 text-text-muted hover:bg-fill-light hover:text-danger"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar chat"
              className="rounded-lg p-1.5 text-text-muted hover:bg-fill-light hover:text-text-primary"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Message container */}
        <div className="flex-1 overflow-y-auto p-4">
          {messages.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center text-center text-xs text-text-muted">
              <div className="mb-2 text-2xl">🤖</div>
              <p className="font-semibold text-text-primary">Olá! Sou o TED.</p>
              <p className="mt-1 max-w-[240px]">
                Posso ajudar você a analisar despesas, consultar metas, simular pagamentos e gerenciar seu orçamento.
              </p>
            </div>
          )}

          {messages.map((m) => (
            <TedMessage key={m.id} message={m} isCurrentUser={m.role === "user"} />
          ))}

          {/* Pending Approval Cards */}
          {activeWorkspace &&
            pendingOps.map((op) => (
              <TedApprovalCard
                key={op.id}
                operation={op}
                workspaceId={activeWorkspace.id}
                onResolved={() => void loadHistory()}
              />
            ))}

          {status === "streaming" && (
            <div className="flex items-center gap-1.5 py-2 text-xs text-text-muted animate-pulse">
              <span>TED está pensando…</span>
            </div>
          )}

          {error && <div className="my-2 rounded-lg bg-danger/10 p-2 text-xs text-danger">{error}</div>}

          <div ref={messagesEndRef} />
        </div>

        {/* Footer Input */}
        <form onSubmit={handleSend} className="border-t border-border p-3">
          <div className="flex items-center gap-2 rounded-xl border border-border bg-fill-light px-3 py-1.5 focus-within:border-primary">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Digite sua mensagem para o TED…"
              aria-label="Mensagem para o assistente"
              className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-muted focus:outline-none"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              aria-label="Enviar mensagem"
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-white transition hover:bg-primary-dark disabled:opacity-40"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
