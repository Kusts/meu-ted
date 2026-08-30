"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useWorkspaceSafe } from "@/lib/auth/workspace-context";
import {
  fetchAgentHistory,
  sendAgentMessage,
  fetchPendingOperations,
  type AgentMessage,
  type PendingOperation,
} from "@/lib/api/agent-client";
import { TedMessage } from "./TedMessage";
import { TedApprovalCard } from "./TedApprovalCard";
import { Sparkles, X, Send } from "lucide-react";

const HISTORY_LOAD_ERROR = "Não foi possível carregar o histórico. Tente novamente.";
const MESSAGE_SEND_ERROR = "Não foi possível enviar a mensagem. Tente novamente.";

interface TedChatProps {
  open: boolean;
  onClose: () => void;
}

export function TedChat({ open, onClose }: TedChatProps) {
  const ws = useWorkspaceSafe();
  const activeWorkspace = ws?.activeWorkspace ?? null;
  const members = ws?.members ?? [];
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [pendingOps, setPendingOps] = useState<PendingOperation[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"connecting" | "ready" | "streaming" | "error">("ready");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  const loadHistory = useCallback(async (preserveError = false) => {
    if (!activeWorkspace) return;
    try {
      setStatus("connecting");
      const [history, ops] = await Promise.all([
        fetchAgentHistory(activeWorkspace.id),
        fetchPendingOperations(activeWorkspace.id).catch(() => []),
      ]);
      setMessages(history);
      setPendingOps(ops);
      if (!preserveError) setError(null);
      setStatus("ready");
    } catch {
      setMessages([]);
      setPendingOps([]);
      setError(HISTORY_LOAD_ERROR);
      setStatus("error");
    }
  }, [activeWorkspace]);

  useEffect(() => {
    if (open && activeWorkspace) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void loadHistory();
    }
  }, [open, activeWorkspace, loadHistory]);

  useEffect(() => {
    if (typeof messagesEndRef.current?.scrollIntoView === "function") {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, pendingOps]);

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

    try {
      await sendAgentMessage(activeWorkspace.id, userText);
      await loadHistory();
    } catch {
      setError(MESSAGE_SEND_ERROR);
      setStatus("error");
      await loadHistory(true);
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Chat com TED"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-xs sm:bottom-6 sm:right-6 sm:top-auto sm:items-end sm:justify-end sm:bg-transparent sm:backdrop-blur-none"
    >
      <div
        ref={modalRef}
        className="flex h-[92dvh] w-full flex-col overflow-hidden rounded-t-[24px] border border-border-subtle bg-surface-1 shadow-modal sm:h-[640px] sm:w-[420px] sm:rounded-[22px]"
      >
        {/* Header */}
        <div className="relative flex items-center justify-between border-b border-border-subtle bg-surface-2/80 px-4 py-3.5 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <span className="relative flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-primary to-[#0A3A28] text-sm font-bold text-white shadow-fab">
              TED
              <span className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3 items-center justify-center rounded-full bg-surface-1 shadow-xs">
                <span className="h-2 w-2 rounded-full bg-primary" />
              </span>
            </span>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-[14px] font-bold tracking-tight text-text-primary">TED</span>
                <span className="rounded-full bg-primary-tint px-1.5 py-0.5 text-[9px] font-bold tracking-wider text-primary">ASSISTENTE</span>
                <span className="h-1 w-1 rounded-full bg-primary" />
                <span className="text-[11px] font-semibold text-primary">{status === "ready" ? "online" : status === "streaming" ? "escrevendo…" : status}</span>
              </div>
              <div className="text-[11px] font-medium leading-none text-text-muted">{activeWorkspace ? activeWorkspace.name : "Selecione um workspace"}</div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar chat"
              className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-surface-3 text-text-primary shadow-xs transition-colors hover:bg-surface-4 cursor-pointer"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Message container */}
        <div className="flex-1 overflow-y-auto bg-bg p-4 [scrollbar-width:thin]">
          {messages.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center px-6 py-10 text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-[#0A3A28] text-white shadow-fab">
                <Sparkles size={28} />
              </div>
              <h3 className="text-[16px] font-bold tracking-tight text-text-primary">Olá! Sou o TED.</h3>
              <p className="mt-1.5 max-w-[280px] text-[13px] leading-relaxed text-text-muted">
                Seu co-piloto financeiro. Posso analisar despesas, consultar metas, simular pagamentos e te ajudar a manter o orçamento no azul.
              </p>
              <div className="mt-5 grid w-full max-w-[300px] gap-2">
                {[
                  "Quanto gastei em alimentação este mês?",
                  "Mostre minhas metas e progresso",
                  "Simule pagamento da fatura de R$ 777,40",
                ].map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => setInput(q)}
                    className="rounded-[14px] border border-border-subtle bg-surface-1 px-3.5 py-2.5 text-left text-[13px] font-medium text-text-secondary shadow-xs transition-all hover:border-primary hover:bg-surface-2 hover:text-text-primary"
                  >
                    “{q}”
                  </button>
                ))}
              </div>
              <div className="mt-4 text-[11px] font-medium tracking-wide text-text-muted">Sugestões • toque para preencher</div>
            </div>
          )}

          {messages.map((m) => {
            const isCurrentUser = m.isOwn;
            const member = members.find(
              (u) => u.userId === m.actorId || (u as unknown as { id?: string }).id === m.actorId,
            );
            const senderName = isCurrentUser ? "Você" : member?.name || "Membro";
            return (
              <TedMessage
                key={m.id}
                message={m}
                isCurrentUser={isCurrentUser}
                senderName={m.role === "assistant" ? "TED" : senderName}
              />
            );
          })}

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
            <div className="flex items-center gap-2 py-3">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-primary to-[#0A3A28] text-white shadow-xs">
                <span className="h-2 w-2 animate-pulse rounded-full bg-white" />
              </span>
              <span className="rounded-full bg-surface-1 border border-border-subtle px-3 py-1.5 text-xs font-semibold text-text-secondary shadow-xs">TED está escrevendo…</span>
            </div>
          )}

          {error && <div role="alert" className="my-3 rounded-[14px] border border-danger/30 bg-danger-tint px-3.5 py-2.5 text-xs font-semibold text-danger">{error}</div>}

          <div ref={messagesEndRef} />
        </div>

        {/* Footer Input */}
        <form onSubmit={handleSend} className="border-t border-border-subtle bg-surface-1 p-3">
          <div className="flex items-end gap-2 rounded-[16px] border border-border-subtle bg-surface-2 px-3 py-2 shadow-xs transition-colors focus-within:border-primary focus-within:bg-surface-1">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void handleSend(e as unknown as React.FormEvent);
                }
              }}
              placeholder="Pergunte sobre gastos, metas ou pagamentos…"
              aria-label="Mensagem para o assistente"
              rows={1}
              className="max-h-28 min-h-[24px] flex-1 resize-none bg-transparent py-1 text-[14px] leading-5 text-text-primary placeholder:text-text-muted focus:outline-none"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              aria-label="Enviar mensagem"
              className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-primary text-white shadow-fab transition-all hover:bg-primary-hover active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none cursor-pointer"
            >
              <Send size={15} />
            </button>
          </div>
          <div className="mt-2 text-center text-[10px] font-medium tracking-wide text-text-muted">Pressione Enter para enviar • Shift+Enter para nova linha</div>
        </form>
      </div>
    </div>
  );
}
