"use client";

import type { AgentMessage } from "@/lib/api/agent-client";

interface TedMessageProps {
  message: AgentMessage;
  isCurrentUser: boolean;
  senderName?: string;
}

function avatarColor(actorId: string, role: string): string {
  if (role === "assistant") return "linear-gradient(135deg, #0E8C5A 0%, #0A5E3A 100%)";
  let hash = 0;
  for (let i = 0; i < actorId.length; i++) hash = (hash * 31 + actorId.charCodeAt(i)) >>> 0;
  const hues = [210, 262, 32, 12, 172, 152];
  const hue = hues[hash % hues.length]!;
  return `hsl(${hue} 58% 42%)`;
}

export function TedMessage({ message, isCurrentUser, senderName }: TedMessageProps) {
  const isAssistant = message.role === "assistant";
  const displayName = isCurrentUser ? "Você" : isAssistant ? "TED" : (senderName || "Membro");
  const initial = isCurrentUser ? "V" : isAssistant ? "T" : (senderName || "M").charAt(0).toUpperCase();

  return (
    <div className={`flex w-full gap-2.5 ${isCurrentUser ? "justify-end" : "justify-start"} my-3`}>
      {!isCurrentUser && (
        <span
          className="flex h-7 w-7 flex-none items-center justify-center rounded-full text-[11px] font-bold text-white shadow-xs"
          style={{ background: avatarColor(message.actorId, message.role) }}
          aria-hidden="true"
        >
          {initial}
        </span>
      )}
      <div className={`flex max-w-[80%] flex-col ${isCurrentUser ? "items-end" : "items-start"}`}>
        <div className="mb-1 flex items-center gap-1.5">
          <span className={`text-[11px] font-bold tracking-tight ${isCurrentUser ? "text-primary" : isAssistant ? "text-primary" : "text-text-muted"}`}>
            {displayName}
          </span>
          <span className="text-[10px] text-text-muted font-medium">
            {message.createdAt ? new Date(message.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : ""}
          </span>
          {isAssistant && <span className="inline-flex items-center rounded-full bg-primary-tint px-1.5 py-0.2 text-[9px] font-bold tracking-wide text-primary">IA</span>}
        </div>
        <div
          className={`relative rounded-[16px] px-3.5 py-2.5 text-[13.5px] leading-relaxed shadow-xs ${
            isCurrentUser
              ? "rounded-br-[4px] bg-primary text-white shadow-fab"
              : isAssistant
                ? "rounded-bl-[4px] border border-border-subtle bg-surface-2 text-text-primary"
                : "rounded-bl-[4px] border border-border-subtle bg-surface-3 text-text-secondary"
          }`}
        >
          <div className="whitespace-pre-wrap break-words">{message.content}</div>
          {Array.isArray((message as unknown as { attachments?: Array<{ type: string; url: string; name?: string }> }).attachments) &&
            (message as unknown as { attachments: Array<{ type: string; url: string; name?: string }> }).attachments.length > 0 && (
              <div className="mt-2 flex flex-col gap-2">
                {(message as unknown as { attachments: Array<{ type: string; url: string; name?: string }> }).attachments.map((att, idx) => {
                  if (att.type === "image") {
                    return (
                      <img
                        key={`${att.url}-${idx}`}
                        src={att.url}
                        alt={att.name || "imagem anexada"}
                        className="max-h-[220px] max-w-full rounded-[10px] border border-border-subtle object-cover"
                      />
                    );
                  }
                  if (att.type === "audio") {
                    return (
                      <audio
                        key={`${att.url}-${idx}`}
                        controls
                        src={att.url}
                        className="w-full max-w-[260px] rounded-[10px]"
                      />
                    );
                  }
                  if (att.type === "pdf") {
                    return (
                      <a
                        key={`${att.url}-${idx}`}
                        href={att.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-[10px] border border-border-subtle bg-surface-1 px-3 py-2 text-xs font-semibold text-primary hover:bg-surface-2"
                      >
                        <span>📄</span>
                        <span>{att.name || "documento.pdf"}</span>
                      </a>
                    );
                  }
                  return null;
                })}
              </div>
            )}
        </div>
      </div>
      {isCurrentUser && (
        <span
          className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-surface-3 text-[11px] font-bold text-text-primary shadow-xs border border-border-subtle"
          aria-hidden="true"
        >
          {initial}
        </span>
      )}
    </div>
  );
}
