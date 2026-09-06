"use client";

import { useEffect, useSyncExternalStore } from "react";

/**
 * Shared overlay a11y primitives (P1-2/P1-3).
 *
 * Body scroll-lock is reference-counted: overlays stack (e.g. a
 * ConfirmActionDialog over a BottomSheet) and the lock must only be released
 * when the LAST overlay closes, restoring the overflow that existed before the
 * first acquire.
 */

let lockCount = 0;
let originalOverflow: string | null = null;

/** Subscribers notified whenever the overlay count changes. */
const overlayListeners = new Set<() => void>();

function emitOverlayChange(): void {
  for (const listener of Array.from(overlayListeners)) {
    listener();
  }
}

export function acquireBodyScrollLock(): void {
  if (lockCount === 0) {
    originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  lockCount += 1;
  emitOverlayChange();
}

export function releaseBodyScrollLock(): void {
  if (lockCount === 0) return;
  lockCount -= 1;
  if (lockCount === 0) {
    document.body.style.overflow = originalOverflow ?? "";
    originalOverflow = null;
  }
  emitOverlayChange();
}

export function bodyScrollLockCount(): number {
  return lockCount;
}

/** Acquires the shared scroll lock while `locked` is true. */
export function useBodyScrollLock(locked: boolean): void {
  useEffect(() => {
    if (!locked) return;
    acquireBodyScrollLock();
    return () => releaseBodyScrollLock();
  }, [locked]);
}

function subscribeOverlayCount(listener: () => void): () => void {
  overlayListeners.add(listener);
  return () => {
    overlayListeners.delete(listener);
  };
}

/**
 * True while ANY overlay (BottomSheet, Dialog, ConfirmActionDialog, TED
 * chat…) holds the shared body scroll lock. Single source of truth for
 * hiding floating elements (TED FAB, invite badge) under overlays — covers
 * present and future overlays without per-feature wiring.
 */
export function useIsOverlayOpen(): boolean {
  return useSyncExternalStore(
    subscribeOverlayCount,
    () => lockCount > 0,
    () => false,
  );
}

/**
 * Overlay stacking layers. ConfirmActionDialog must always render above
 * BottomSheets and generic dialogs (it confirms actions opened inside them).
 */
export const OVERLAY_Z_INDEX = {
  sheet: 40,
  dialog: 50,
  confirmAction: 60,
} as const;
