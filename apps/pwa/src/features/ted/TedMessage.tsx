"use client";

import type { AgentMessage } from "@/lib/api/agent-client";

interface TedMessageProps {
  message: AgentMessage;
  isCurrentUser: boolean;
}

function avatarColor(actorId: string, role: string): string {
  if (role === "assistant") return "linear-gradient(135deg,#0E8C5A 0%,#0A5E3A 100%)";
  // Deterministic color from actorId
  let hash = 0;
  for (let i = 0; i < actorId.length; i++) hash = (hash * 31 + actorId.charCodeAt(i)) >>> 0;
  const hues = [210, 262, 32, 12, 172, 152];
  const hue = hues[hash % hues.length]!;
  return `hsl(${hue} 58% 42%)`;
}

export function TedMessage({ message, isCurrentUser }: TedMessageProps) {
  const isAssistant = message.role === "assistant";
  const initial = (message.actorId || (isAssistant ? "TED" : "U")).charAt(0).toUpperCase();
  const displayName = isCurrentUser ? "Você" : isAssistant ? "TED" : message.actorId.slice(0, 8);

  return (
    <div className={`flex w-full gap-2.5 ${isCurrentUser ? "justify-end" : "justify-start"} my-3`}>
      {!isCurrentUser && (
        <span
          className="flex h-7 w-7 flex-none items-center justify-center rounded-full text-[11px] font-bold text-white shadow-sm ring-1 ring-black/5"
          style={{ background: avatarColor(message.actorId, message.role) }}
          aria-hidden="true"
        >
          {initial}
        </span>
      )}
      <div className={`flex max-w-[78%] flex-col ${isCurrentUser ? "items-end" : "items-start"}`}>
        <div className="mb-1 flex items-center gap-1.5">
          <span className={`text-[11px] font-semibold tracking-tight ${isCurrentUser ? "text-emerald-800" : isAssistant ? "text-emerald-800" : "text-text-muted"}`}>
            {displayName}
          </span>
          <span className="text-[10px] text-text-muted">
            {message.createdAt ? new Date(message.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : ""}
          </span>
          {isAssistant && <span className="inline-flex items-center rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-emerald-700 ring-1 ring-emerald-200">IA</span>}
        </div>
        <div
          className={`relative rounded-2xl px-3.5 py-2.5 text-[13.5px] leading-[1.5] shadow-sm ${
            isCurrentUser
              ? "rounded-br-md bg-gradient-to-br from-emerald-600 to-teal-700 text-white shadow-[0_2px_8px_rgba(16,122,87,0.22)]"
              : isAssistant
                ? "rounded-bl-md border border-emerald-100 bg-white text-text-primary shadow-[0_1px_4px_rgba(0,0,0,0.06)]"
                : "rounded-bl-md border border-slate-200 bg-slate-50 text-slate-700"
          }`}
        >
          <div className="whitespace-pre-wrap break-words [font-variant-ligatures:common-ligatures]">{message.content}</div>
        </div>
      </div>
      {isCurrentUser && (
        <span
          className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-slate-900 text-[11px] font-bold text-white shadow-sm ring-1 ring-black/5"
          aria-hidden="true"
        >
          {initial}
        </span>
      )}
    </div>
  );
}
