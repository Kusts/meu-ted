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
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 backdrop-blur-[2px] sm:bottom-6 sm:right-6 sm:top-auto sm:items-end sm:justify-end sm:bg-transparent sm:backdrop-blur-none"
    >
      <div
        ref={modalRef}
        className="flex h-[92dvh] w-full flex-col overflow-hidden rounded-t-[24px] border border-slate-200 bg-white shadow-[0_20px_60px_rgba(0,0,0,0.18),0_8px_24px_rgba(0,0,0,0.12)] sm:h-[640px] sm:w-[420px] sm:rounded-[20px]"
      >
        {/* Header — premium with gradient accent */}
        <div className="relative flex items-center justify-between border-b border-slate-100 bg-gradient-to-br from-white to-emerald-50/60 px-4 py-3.5">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-200/60 to-transparent" aria-hidden="true" />
          <div className="flex items-center gap-3">
            <span className="relative flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-emerald-600 to-teal-700 text-sm font-bold text-white shadow-md ring-1 ring-black/5">
              TED
              <span className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-emerald-200">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
              </span>
            </span>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-[14px] font-bold tracking-tight text-slate-900">TED</span>
                <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold tracking-wider text-emerald-700 ring-1 ring-emerald-200">ASSISTENTE</span>
                <span className="h-1 w-1 rounded-full bg-emerald-500" />
                <span className="text-[11px] font-medium text-emerald-700">{status === "ready" ? "online" : status === "streaming" ? "escrevendo…" : status}</span>
              </div>
              <div className="text-[12px] font-medium leading-none text-slate-500">{activeWorkspace ? activeWorkspace.name : "Selecione um workspace"}</div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleExport}
              title="Exportar histórico"
              aria-label="Exportar histórico"
              className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white text-slate-500 shadow-sm ring-1 ring-slate-200 transition hover:bg-slate-50 hover:text-slate-700"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            </button>
            <button
              type="button"
              onClick={handleClear}
              title="Limpar meu histórico"
              aria-label="Limpar meu histórico"
              className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white text-slate-500 shadow-sm ring-1 ring-slate-200 transition hover:bg-rose-50 hover:text-rose-600 hover:ring-rose-200"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar chat"
              className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-white shadow-sm transition hover:bg-slate-800"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Message container */}
        <div className="flex-1 overflow-y-auto bg-gradient-to-b from-white to-slate-50/60 p-4 [scrollbar-width:thin]">
          {messages.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center px-6 py-10 text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-700 text-white shadow-lg ring-1 ring-black/5">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 11.5a8.38 8.38 0 0 1-1.9.5 4.48 4.48 0 0 0 1.1-5.4 8.94 8.94 0 0 1-2.8 1.1 4.48 4.48 0 0 0-7.6 4.1 12.7 12.7 0 0 1-9.2-4.7 4.48 4.48 0 0 0 1.4 6 4.48 4.48 0 0 1-2-.6v.1a4.48 4.48 0 0 0 3.6 4.4 4.5 4.5 0 0 1-2 .1 4.48 4.48 0 0 0 4.2 3.1A8.99 8.99 0 0 1 2 19.5a12.7 12.7 0 0 0 6.9 2c8.3 0 12.8-6.9 12.8-12.8v-.6A9.2 9.2 0 0 0 24 6.1a8.94 8.94 0 0 1-3 1.1z" />
                </svg>
              </div>
              <h3 className="text-[15px] font-bold tracking-tight text-slate-900">Olá! Sou o TED.</h3>
              <p className="mt-1.5 max-w-[280px] text-[13px] leading-relaxed text-slate-600">
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
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left text-[13px] font-medium text-slate-700 shadow-sm transition hover:border-emerald-200 hover:bg-emerald-50/60 hover:text-emerald-900"
                  >
                    “{q}”
                  </button>
                ))}
              </div>
              <div className="mt-4 text-[11px] font-medium tracking-wide text-slate-400">Sugestões • toque para preencher</div>
            </div>
          )}

          {messages.map((m) => (
            <TedMessage key={m.id} message={m} isCurrentUser={m.role === "user"} />
          ))}

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
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-emerald-600 to-teal-700 text-white shadow-sm">
                <span className="h-2 w-2 animate-pulse rounded-full bg-white" />
              </span>
              <span className="rounded-full bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm ring-1 ring-slate-200">TED está escrevendo…</span>
            </div>
          )}

          {error && <div className="my-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs font-medium text-rose-800">{error}</div>}

          <div ref={messagesEndRef} />
        </div>

        {/* Footer Input */}
        <form onSubmit={handleSend} className="border-t border-slate-100 bg-white p-3">
          <div className="flex items-end gap-2 rounded-[16px] border border-slate-200 bg-slate-50 px-3 py-2 shadow-inner transition focus-within:border-emerald-300 focus-within:bg-white focus-within:shadow-[0_0_0_4px_rgba(16,185,129,0.12)]">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend(e as unknown as React.FormEvent);
                }
              }}
              placeholder="Pergunte sobre gastos, metas ou pagamentos…"
              aria-label="Mensagem para o assistente"
              rows={1}
              className="max-h-28 min-h-[24px] flex-1 resize-none bg-transparent py-1.5 text-[14px] leading-5 text-slate-900 placeholder:text-slate-400 focus:outline-none"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              aria-label="Enviar mensagem"
              className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-gradient-to-br from-emerald-600 to-teal-700 text-white shadow-md ring-1 ring-black/5 transition hover:from-emerald-500 hover:to-teal-600 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
            >
              <svg className="h-4 w-4 translate-x-[1px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </button>
          </div>
          <div className="mt-2 text-center text-[11px] font-medium tracking-wide text-slate-400">Pressione Enter para enviar • Shift+Enter para nova linha</div>
        </form>
      </div>
    </div>
  );
}
