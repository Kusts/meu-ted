"use client";

import { useEffect } from "react";

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

export function acquireBodyScrollLock(): void {
  if (lockCount === 0) {
    originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  lockCount += 1;
}

export function releaseBodyScrollLock(): void {
  if (lockCount === 0) return;
  lockCount -= 1;
  if (lockCount === 0) {
    document.body.style.overflow = originalOverflow ?? "";
    originalOverflow = null;
  }
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

/**
 * Overlay stacking layers. ConfirmActionDialog must always render above
 * BottomSheets and generic dialogs (it confirms actions opened inside them).
 */
export const OVERLAY_Z_INDEX = {
  sheet: 40,
  dialog: 50,
  confirmAction: 60,
} as const;
