"use client";

import { useState } from "react";
import { TedChat } from "./TedChat";
import { Sparkles } from "lucide-react";

export function TedChatLauncher() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Abrir assistente TED"
        className="group fixed bottom-[88px] right-4 z-40 flex items-center gap-3 rounded-full bg-gradient-to-br from-primary to-[#0A3A28] px-4 py-3 text-white shadow-fab ring-1 ring-white/10 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-modal focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30 active:translate-y-0 sm:bottom-6 sm:right-6 sm:px-5 sm:py-3.5"
      >
        <span className="relative flex h-9 w-9 items-center justify-center rounded-full bg-white/15 ring-1 ring-white/20 backdrop-blur-sm shadow-xs">
          <Sparkles size={19} className="text-white" />
          <span className="absolute -right-0.5 -top-0.5 flex h-3 w-3 items-center justify-center">
            <span className="absolute inline-flex h-3 w-3 animate-ping rounded-full bg-[#7FE3B0] opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full border-2 border-surface-1 bg-primary" />
          </span>
        </span>
        <span className="flex flex-col items-start leading-none">
          <span className="text-[10px] font-bold uppercase tracking-wider text-white/75">Assistente</span>
          <span className="text-[15px] font-bold tracking-tight text-white">TED</span>
        </span>
        <span className="ml-1 hidden h-6 w-px bg-white/20 sm:block" aria-hidden="true" />
        <span className="hidden text-xs font-bold text-white/90 sm:block">Conversar</span>
      </button>

      <TedChat open={open} onClose={() => setOpen(false)} />
    </>
  );
}
