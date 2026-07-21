/**
 * SWCoordinator — registers /sw.js, handles kill-switch, and coordinates
 * waiting-worker activation based on UnsavedChanges dirty state.
 *
 * Provider tree (RootProviders):
 *   UnsavedChangesProvider > SWCoordinator > AppStateProvider > SheetProvider
 *
 * Clean + waiting → postMessage CLEAN_UPDATE → skipWaiting → single reload
 * Dirty + waiting → retain waiting worker (no message, no reload)
 */

"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useUnsavedChanges } from "@/lib/unsaved-changes";

const CACHE_PREFIX = "pi-finance";

export function useSWCoordinator() {
  const { isDirty } = useUnsavedChanges();
  return { isDirty };
}

function clearPiFinanceCaches() {
  if (!("caches" in globalThis)) return;
  void caches.keys().then((names) => {
    names
      .filter((n) => n.startsWith(CACHE_PREFIX))
      .forEach((n) => void caches.delete(n));
  });
}

/**
 * Apply CLEAN_UPDATE to a waiting worker when the form is clean.
 * Returns true if a message was sent (caller should expect activation/reload).
 */
export function activateWaitingIfClean(
  registration: ServiceWorkerRegistration,
  isDirty: boolean,
): boolean {
  const waiting = registration.waiting;
  if (!waiting) return false;
  if (isDirty) return false;
  waiting.postMessage({ type: "CLEAN_UPDATE" });
  waiting.postMessage({ action: "CLEAN_UPDATE" });
  return true;
}

export function SWCoordinator({ children }: { children: ReactNode }) {
  const { isDirty } = useUnsavedChanges();
  const isDirtyRef = useRef(isDirty);
  const reloadedRef = useRef(false);
  const bootRef = useRef(false);

  useEffect(() => {
    isDirtyRef.current = isDirty;
  }, [isDirty]);

  useEffect(() => {
    if (bootRef.current) return;
    bootRef.current = true;
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    void fetch("/pwa-control", { cache: "no-store" })
      .then((res) => res.json())
      .then((body: { enabled?: boolean }) => {
        if (body?.enabled === false) {
          void navigator.serviceWorker.getRegistrations().then((regs) => {
            regs.forEach((r) => void r.unregister());
          });
          clearPiFinanceCaches();
        }
      })
      .catch(() => {
        /* pwa-control may be unavailable during SSG */
      });

    let registration: ServiceWorkerRegistration | null = null;

    const onControllerChange = () => {
      if (reloadedRef.current) return;
      reloadedRef.current = true;
      window.location.reload();
    };

    const maybeActivate = (reg: ServiceWorkerRegistration) => {
      const sent = activateWaitingIfClean(reg, isDirtyRef.current);
      if (sent) {
        navigator.serviceWorker.addEventListener(
          "controllerchange",
          onControllerChange,
        );
      }
    };

    const onUpdateFound = () => {
      if (!registration) return;
      const installing = registration.installing;
      if (!installing) return;
      installing.addEventListener("statechange", () => {
        if (installing.state === "installed" && registration) {
          maybeActivate(registration);
        }
      });
    };

    void navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        registration = reg;
        if (reg.waiting) maybeActivate(reg);
        reg.addEventListener("updatefound", onUpdateFound);
        void reg.update().catch(() => {});
      })
      .catch(() => {
        /* registration can fail offline / file:// */
      });

    return () => {
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        onControllerChange,
      );
      if (registration) {
        registration.removeEventListener("updatefound", onUpdateFound);
      }
    };
  }, []);

  // When form becomes clean while a worker is waiting, activate once.
  useEffect(() => {
    if (isDirty) return;
    if (!("serviceWorker" in navigator)) return;
    void navigator.serviceWorker.getRegistration().then((reg) => {
      if (!reg?.waiting) return;
      const sent = activateWaitingIfClean(reg, false);
      if (sent && !reloadedRef.current) {
        const onControllerChange = () => {
          if (reloadedRef.current) return;
          reloadedRef.current = true;
          window.location.reload();
        };
        navigator.serviceWorker.addEventListener(
          "controllerchange",
          onControllerChange,
        );
      }
    });
  }, [isDirty]);

  return <>{children}</>;
}
