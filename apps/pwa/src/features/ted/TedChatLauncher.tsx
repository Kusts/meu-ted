"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { TedChat } from "./TedChat";
import { useIsOverlayOpen } from "@/lib/ui/overlay-a11y";

/**
 * Public open channel for the TED chat (mirrors the `pwa:open-tx`
 * convention in AppShell). Any surface — e.g. the empty Insights card —
 * opens the existing chat via `openTedChat()`; the launcher owns the
 * listener, so there is a single source of truth, no parallel event.
 */
export const OPEN_TED_CHAT_EVENT = "pwa:open-ted";

export function openTedChat(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(OPEN_TED_CHAT_EVENT));
  }
}

export function TedChatLauncher() {
  const [open, setOpen] = useState(false);
  // A1: hide the FAB while any overlay (sheet/dialog/confirm) is open so it
  // never renders above — or below but visually clashing with — overlay
  // content. Also hidden while its own chat is open.
  const overlayOpen = useIsOverlayOpen();

  useEffect(() => {
    function handler() {
      setOpen(true);
    }
    window.addEventListener(OPEN_TED_CHAT_EVENT, handler);
    return () => window.removeEventListener(OPEN_TED_CHAT_EVENT, handler);
  }, []);

  if (overlayOpen || open) {
    return <TedChat open={open} onClose={() => setOpen(false)} />;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Abrir assistente TED"
        className="group fixed bottom-[88px] right-4 z-40 h-14 w-14 overflow-hidden rounded-full shadow-fab ring-1 ring-white/10 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-modal focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30 active:translate-y-0 motion-reduce:transition-none motion-reduce:hover:translate-y-0 lg:bottom-6 lg:right-6"
      >
        <Image
          src="/brand/ted-launcher.png"
          alt=""
          width={56}
          height={56}
          priority
          className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100"
        />
      </button>

      <TedChat open={open} onClose={() => setOpen(false)} />
    </>
  );
}
