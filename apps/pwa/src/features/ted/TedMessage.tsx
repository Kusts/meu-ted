"use client";

import type { AgentMessage } from "@/lib/api/agent-client";

interface TedMessageProps {
  message: AgentMessage;
  isCurrentUser: boolean;
}

export function TedMessage({ message, isCurrentUser }: TedMessageProps) {
  const isAssistant = message.role === "assistant";

  return (
    <div className={`flex w-full ${isCurrentUser ? "justify-end" : "justify-start"} my-2`}>
      <div
        className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm ${
          isCurrentUser
            ? "bg-primary text-white"
            : isAssistant
              ? "border border-border bg-bg-surface text-text-primary shadow-sm"
              : "border border-border/40 bg-fill-light text-text-secondary"
        }`}
      >
        <div className="mb-0.5 text-[10px] font-medium opacity-70">
          {isCurrentUser ? "Você" : isAssistant ? "TED (Assistente)" : message.actorId}
        </div>
        <div className="whitespace-pre-wrap break-words leading-relaxed">{message.content}</div>
        {message.createdAt && (
          <div className="mt-1 text-right text-[9px] opacity-60">
            {new Date(message.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
          </div>
        )}
      </div>
    </div>
  );
}
