"use client";

import { useState } from "react";
import { TedChat } from "./TedChat";

export function TedChatLauncher() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Abrir assistente TED"
        className="group fixed bottom-[88px] right-4 z-40 flex items-center gap-3 rounded-full bg-gradient-to-br from-emerald-600 to-teal-700 px-4 py-3 text-white shadow-[0_8px_24px_rgba(16,122,87,0.32),0_2px_8px_rgba(0,0,0,0.12)] ring-1 ring-black/5 transition-all duration-200 hover:translate-y-[-1px] hover:shadow-[0_12px_32px_rgba(16,122,87,0.36),0_4px_12px_rgba(0,0,0,0.14)] hover:from-emerald-500 hover:to-teal-600 focus:outline-none focus-visible:ring-4 focus-visible:ring-emerald-500/30 active:translate-y-[0px] sm:bottom-6 sm:right-6 sm:px-5 sm:py-3.5"
      >
        <span className="relative flex h-9 w-9 items-center justify-center rounded-full bg-white/15 ring-1 ring-white/20 backdrop-blur-sm">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-white"
            aria-hidden="true"
          >
            <path d="M21 11.5a8.38 8.38 0 0 1-1.9.5 4.48 4.48 0 0 0 1.1-5.4 8.94 8.94 0 0 1-2.8 1.1 4.48 4.48 0 0 0-7.6 4.1 12.7 12.7 0 0 1-9.2-4.7 4.48 4.48 0 0 0 1.4 6 4.48 4.48 0 0 1-2-.6v.1a4.48 4.48 0 0 0 3.6 4.4 4.5 4.5 0 0 1-2 .1 4.48 4.48 0 0 0 4.2 3.1A8.99 8.99 0 0 1 2 19.5a12.7 12.7 0 0 0 6.9 2c8.3 0 12.8-6.9 12.8-12.8v-.6A9.2 9.2 0 0 0 24 6.1a8.94 8.94 0 0 1-3 1.1z" />
          </svg>
          <span className="absolute -right-0.5 -top-0.5 flex h-3 w-3 items-center justify-center">
            <span className="absolute inline-flex h-3 w-3 animate-ping rounded-full bg-emerald-300 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-400" />
          </span>
        </span>
        <span className="flex flex-col items-start leading-none">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-white/80">Assistente</span>
          <span className="text-[15px] font-bold tracking-tight text-white">TED</span>
        </span>
        <span className="ml-1 hidden h-6 w-px bg-white/20 sm:block" aria-hidden="true" />
        <span className="hidden text-xs font-medium text-white/90 sm:block">Conversar</span>
      </button>

      <TedChat open={open} onClose={() => setOpen(false)} />
    </>
  );
}
