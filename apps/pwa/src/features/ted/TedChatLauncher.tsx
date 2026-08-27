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
        className="fixed bottom-[80px] right-4 z-40 flex h-13 w-13 items-center justify-center rounded-full bg-primary text-white shadow-xl transition-transform duration-200 hover:scale-105 hover:bg-primary-dark focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30 sm:bottom-6 sm:right-6 sm:h-14 sm:w-14"
      >
        <span className="font-bold text-sm tracking-tight">TED</span>
        <div className="absolute right-0 top-0 h-3 w-3 rounded-full border-2 border-white bg-accent-green" />
      </button>

      <TedChat open={open} onClose={() => setOpen(false)} />
    </>
  );
}
