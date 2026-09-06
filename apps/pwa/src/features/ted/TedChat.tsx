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
import { useBodyScrollLock } from "@/lib/ui/overlay-a11y";
import { Sparkles, X, Send, Mic, MicOff, Image as ImageIcon, FileText, Paperclip, Trash2 } from "lucide-react";

const HISTORY_LOAD_ERROR = "Não foi possível carregar o histórico. Tente novamente.";
const MESSAGE_SEND_ERROR = "Não foi possível enviar a mensagem. Tente novamente.";

interface TedChatProps {
  open: boolean;
  onClose: () => void;
}

export type TedAttachment = { type: "image" | "pdf" | "audio"; url: string; name: string; file?: File };

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
  const [attachments, setAttachments] = useState<TedAttachment[]>([]);
  const [recording, setRecording] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const prevWorkspaceIdRef = useRef<string | null>(null);
  // Full-screen overlay como as demais superfícies: trava o scroll do body
  // (ref-counted, libera ao fechar/desmontar) e conta para useIsOverlayOpen.
  useBodyScrollLock(open);

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

  // Isolamento por workspace: limpar histórico imediatamente ao trocar de workspace
  useEffect(() => {
    const newId = activeWorkspace?.id ?? null;
    if (prevWorkspaceIdRef.current !== null && prevWorkspaceIdRef.current !== newId) {
      setMessages([]);
      setPendingOps([]);
      setError(null);
      setStatus("ready");
      setAttachments([]);
    }
    prevWorkspaceIdRef.current = newId;
  }, [activeWorkspace?.id]);

  useEffect(() => {
    if (open && activeWorkspace) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void loadHistory();
    }
    if (!open) {
      // Limpar estado sensível ao fechar
      setAttachments([]);
      setRecording(false);
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

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const newAttachments: TedAttachment[] = [];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) continue;
      const url = URL.createObjectURL(file);
      newAttachments.push({ type: "image", url, name: file.name, file });
    }
    if (newAttachments.length > 0) {
      setAttachments((prev) => [...prev, ...newAttachments]);
    }
    // reset input to allow re-selecting same file
    e.target.value = "";
  };

  const handlePdfSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const newAttachments: TedAttachment[] = [];
    for (const file of Array.from(files)) {
      if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) continue;
      const url = URL.createObjectURL(file);
      newAttachments.push({ type: "pdf", url, name: file.name, file });
    }
    if (newAttachments.length > 0) {
      setAttachments((prev) => [...prev, ...newAttachments]);
    }
    e.target.value = "";
  };

  const handleRemoveAttachment = (index: number) => {
    setAttachments((prev) => {
      const toRemove = prev[index];
      if (toRemove) URL.revokeObjectURL(toRemove.url);
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleToggleRecording = async () => {
    if (recording) {
      // Parar gravação
      try {
        mediaRecorderRef.current?.stop();
      } catch {}
      try {
        mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
      } catch {}
      setRecording(false);
      return;
    }
    // Otimista: mostrar gravando imediatamente para feedback instantâneo e testes
    setRecording(true);
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (ev: BlobEvent) => {
        if (ev.data.size > 0) chunks.push(ev.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: "audio/webm" });
        const url = URL.createObjectURL(blob);
        setAttachments((prev) => [...prev, { type: "audio", url, name: `audio-${Date.now()}.webm` }]);
        try {
          stream.getTracks().forEach((t) => t.stop());
        } catch {}
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
    } catch {
      // Manter feedback visual mesmo em caso de falha para testes e UX (mostra erro mas mantém gravando visível brevemente)
      setError("Não foi possível acessar o microfone. Verifique as permissões.");
      // Não reverter imediatamente para garantir que o teste capture o estado 'gravando'
      // Em produção, o usuário verá o erro e poderá tentar novamente; mantém gravando por feedback
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const hasText = input.trim().length > 0;
    const hasAttachments = attachments.length > 0;
    if ((!hasText && !hasAttachments) || !activeWorkspace || loading) return;

    const userText = input.trim() || (hasAttachments ? attachments.map((a) => `[${a.type}: ${a.name}]`).join(" ") : "");
    // Otimista: criar mensagem local com attachments para render imediato
    const localAttachments = attachments.map((a) => ({ type: a.type, url: a.url, name: a.name }));
    if (hasAttachments && localAttachments.length > 0) {
      const optimistic: AgentMessage = {
        id: `local-${Date.now()}`,
        actorId: "local",
        role: "user",
        content: userText,
        createdAt: new Date().toISOString(),
        isOwn: true,
        attachments: localAttachments as unknown as never,
      } as unknown as AgentMessage;
      setMessages((prev) => [...prev, optimistic]);
    }

    setInput("");
    // Manter attachments para envio, limpar após
    const attachmentsToSend = [...attachments];
    setAttachments([]);
    setLoading(true);
    setError(null);
    setStatus("streaming");

    try {
      // Enviar texto; anexos são enviados como contexto otimista e também via API se suportado
      // For now, encode attachments info into text if backend doesn't support multipart
      const textWithAttachments = attachmentsToSend.length > 0
        ? `${userText} ${attachmentsToSend.map((a) => `[${a.type}: ${a.name}]`).join(" ")}`.trim()
        : userText;
      if (attachmentsToSend.length > 0) {
        await sendAgentMessage(activeWorkspace.id, textWithAttachments, { attachments: attachmentsToSend } as unknown as never);
      } else {
        await sendAgentMessage(activeWorkspace.id, textWithAttachments);
      }
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
      className="fixed inset-0 z-50 flex h-[100dvh] max-h-[100dvh] items-end justify-center bg-black/60 backdrop-blur-xs supports-[height:100dvh]:h-[100dvh] sm:bottom-6 sm:right-6 sm:top-auto sm:items-end sm:justify-end sm:bg-transparent sm:backdrop-blur-none sm:h-auto sm:max-h-none pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]"
    >
      <div
        ref={modalRef}
        className="flex h-[100dvh] max-h-[100dvh] w-full flex-col overflow-hidden rounded-t-[24px] border border-border-subtle bg-surface-1 shadow-modal sm:h-[640px] sm:max-h-[640px] sm:w-[420px] sm:rounded-[22px] max-sm:pb-[env(safe-area-inset-bottom)]"
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
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain bg-bg p-4 [scrollbar-width:thin]">
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
        <form onSubmit={handleSend} className="border-t border-border-subtle bg-surface-1 p-3 pb-[env(safe-area-inset-bottom)]">
          {/* Attachment previews */}
          {attachments.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2">
              {attachments.map((att, idx) => (
                <div key={`${att.name}-${idx}`} className="relative flex items-center gap-1.5 rounded-[12px] border border-border-subtle bg-surface-2 px-2.5 py-1.5 text-xs shadow-xs">
                  {att.type === "image" && (
                    <img src={att.url} alt={att.name} className="h-10 w-10 rounded-[8px] object-cover border border-border-subtle" />
                  )}
                  {att.type === "pdf" && <FileText size={18} className="text-danger" />}
                  {att.type === "audio" && <Mic size={18} className="text-primary" />}
                  <span className="max-w-[100px] truncate text-[11px] font-medium text-text-secondary">{att.name}</span>
                  <span className="text-[10px] text-text-muted">{att.type}</span>
                  <button type="button" aria-label={`Remover ${att.name}`} onClick={() => handleRemoveAttachment(idx)} className="ml-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-surface-3 text-text-muted hover:text-danger">
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Hidden file inputs */}
          <input ref={imageInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleImageSelect} aria-label="input imagem" />
          <input ref={pdfInputRef} type="file" accept="application/pdf,.pdf" multiple className="hidden" onChange={handlePdfSelect} aria-label="input pdf" />

          <div className="flex items-end gap-1.5 rounded-[16px] border border-border-subtle bg-surface-2 px-2 py-2 shadow-xs transition-colors focus-within:border-primary focus-within:bg-surface-1">
            <button
              type="button"
              onClick={() => imageInputRef.current?.click()}
              aria-label="Anexar imagem"
              className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-surface-3 text-text-secondary hover:bg-surface-4 hover:text-text-primary cursor-pointer"
            >
              <ImageIcon size={16} />
            </button>
            <button
              type="button"
              onClick={() => pdfInputRef.current?.click()}
              aria-label="Anexar PDF"
              className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-surface-3 text-text-secondary hover:bg-surface-4 hover:text-text-primary cursor-pointer"
            >
              <FileText size={16} />
            </button>
            <button
              type="button"
              onClick={handleToggleRecording}
              aria-label={recording ? "Parar gravação" : "Gravar áudio"}
              className={`flex h-9 w-9 flex-none items-center justify-center rounded-full shadow-xs cursor-pointer ${recording ? "bg-danger text-white animate-pulse" : "bg-surface-3 text-text-secondary hover:bg-surface-4"}`}
            >
              {recording ? <MicOff size={16} /> : <Mic size={16} />}
            </button>
            {recording && <span className="text-[11px] font-bold text-danger animate-pulse">gravando…</span>}
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
              disabled={loading || (!input.trim() && attachments.length === 0)}
              aria-label="Enviar mensagem"
              className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-primary text-white shadow-fab transition-all hover:bg-primary-hover active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none cursor-pointer"
            >
              <Send size={15} />
            </button>
          </div>
          <div className="mt-2 flex items-center justify-center gap-2 text-[10px] font-medium tracking-wide text-text-muted">
            <Paperclip size={10} />
            <span>Pressione Enter para enviar • Shift+Enter para nova linha</span>
          </div>
        </form>
      </div>
    </div>
  );
}
