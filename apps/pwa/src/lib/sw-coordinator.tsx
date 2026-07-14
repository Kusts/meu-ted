// PWA boot coordinator — runs on page load to check SW status.
// Fetches /pwa-control with no-store; if disabled, unregisters SW
// and deletes only pi-finance-* caches (never other caches).

"use client";

import { useEffect, useRef } from "react";
import { useUnsavedChanges } from "@/lib/unsaved-changes";

const CACHE_PREFIX = "pi-finance";

export function useSWCoordinator() {
  const { isDirty } = useUnsavedChanges();
  const hasRun = useRef(false);

  useEffect(() => {
    if (hasRun.current) return;
    hasRun.current = true;

    // Boot: check pwa-control with no-store cache avoidance
    fetch("/pwa-control", { cache: "no-store" })
      .then((res) => res.json())
      .then((body) => {
        if (body?.enabled === false) {
          // SW disabled: unregister and clear pi-finance caches
          if ("serviceWorker" in navigator) {
            navigator.serviceWorker.getRegistrations().then((regs) => {
              regs.forEach((r) => r.unregister());
            });
          }
          if ("caches" in globalThis) {
            caches.keys().then((names) => {
              names
                .filter((n) => n.startsWith(CACHE_PREFIX))
                .forEach((n) => caches.delete(n));
            });
          }
        }
      })
      .catch(() => {
        // pwa-control unreachable is normal during build/SSG
      });
  }, []);

  // Return dirty state for SW update coordination
  return { isDirty };
}
