"use client";

import { useEffect, useLayoutEffect, useRef, useSyncExternalStore, type RefObject } from "react";

/**
 * Shared overlay a11y primitives (P1-2/P1-3 + SPEC §21 / H2).
 *
 * Body scroll-lock is reference-counted: overlays stack (e.g. a
 * ConfirmActionDialog over a BottomSheet) and the lock must only be released
 * when the LAST overlay closes, restoring the overflow that existed before the
 * first acquire.
 *
 * SPEC §21 adds the shared dialog-focus primitive below (`useOverlayDialog`):
 * initial focus, focus trap, focus restore, Escape (topmost overlay only),
 * and background inert — all ref-counted across stacked overlays.
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

/* ── SPEC §21 (H2): shared overlay dialog focus primitive ──────────────── */

/** True when the user prefers reduced motion (Onda 4). */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function")
    return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Focusable elements inside `container`, DOM order. Skips disabled controls,
 * hidden inputs/attributes, `[inert]`/`aria-hidden="true"` subtrees and
 * Tailwind's `hidden` utility (jsdom cannot resolve stylesheet-driven
 * `display: none`, so the class check keeps tests and browsers aligned).
 */
const FOCUSABLE_SELECTOR = [
  "a[href]",
  "area[href]",
  "button:not(:disabled)",
  "input:not(:disabled)",
  "select:not(:disabled)",
  "textarea:not(:disabled)",
  "iframe",
  "object",
  "embed",
  "[contenteditable]",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  ).filter((el) => {
    if (el.closest("[inert]")) return false;
    if (el.closest('[aria-hidden="true"]')) return false;
    if (el.hasAttribute("hidden")) return false;
    if (el instanceof HTMLInputElement && el.type === "hidden") return false;
    if (el.classList.contains("hidden")) return false;
    const style = window.getComputedStyle(el);
    return style.display !== "none" && style.visibility !== "hidden";
  }).sort((left, right) => {
    if (left === right) return 0;
    return left.compareDocumentPosition(right) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
  });
}

/** Active overlay entries; the last one is the topmost (stacking, §21). */
const overlayStack: Array<{ token: symbol; container: HTMLElement }> = [];

/** Ref-count of inert marks per background element (stacked overlays). */
const inertCounts = new Map<HTMLElement, number>();

/**
 * Background elements that must become inert while `root` is open: every
 * sibling from `root` up to `<body>`. Ancestors of the overlay itself are
 * never inerted, so a nested overlay (confirm inside a sheet) stays usable.
 */
function inertTargetsFor(root: HTMLElement): HTMLElement[] {
  const targets: HTMLElement[] = [];
  let node: HTMLElement | null = root;
  while (node) {
    const parent: HTMLElement | null = node.parentElement;
    if (!parent) break;
    for (const sibling of Array.from(parent.children)) {
      if (sibling !== node && sibling instanceof HTMLElement) {
        targets.push(sibling);
      }
    }
    if (parent === document.body) break;
    node = parent;
  }
  return targets;
}

export interface UseOverlayDialogOptions {
  /** Whether the overlay is currently shown (mounted). */
  open: boolean;
  /**
   * Escape handler. Invoked only while this overlay is the TOPMOST of the
   * stack, so closing a confirm dialog never closes the sheet under it.
   */
  onEscape?: () => void;
  /**
   * Initial focus target: the first focusable element (default), the
   * container itself, or an explicit element getter. An element already
   * focused inside the overlay (e.g. React `autoFocus`) always wins.
   */
  initialFocus?: "first" | "container" | (() => HTMLElement | null);
}

/**
 * Shared modal dialog a11y (SPEC §21 / H2): initial focus, Tab/Shift+Tab
 * trap, Escape (topmost only) and ref-counted background inert. The
 * component keeps declaring `role="dialog"`, `aria-modal` and its own
 * `aria-labelledby`/`aria-label`; the primitive never touches them.
 *
 * Focus restore on close: the element focused before opening (if still
 * connected), otherwise the first `[data-overlay-restore-fallback]` element,
 * otherwise the first focusable element in the document.
 */
export function useOverlayDialog(
  containerRef: RefObject<HTMLElement | null>,
  options: UseOverlayDialogOptions,
): void {
  const { open } = options;
  const optionsRef = useRef(options);
  // Latest-options mirror for the Escape handler + initial-focus read inside
  // the layout effect below. A layout-phase sync (declared first, runs
  // first) keeps the topmost-overlay key handler fresh without a render-time
  // ref write (react-hooks/refs); initial useRef value covers first mount.
  useLayoutEffect(() => {
    optionsRef.current = options;
  });
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const inertedRef = useRef<HTMLElement[]>([]);
  const suspendedInertAncestorsRef = useRef<HTMLElement[]>([]);

  useLayoutEffect(() => {
    if (!open) return;
    const container = containerRef.current;
    if (!container) return;

    // A modal root is the safe fallback when it has no controls and is also a
    // valid explicit initial target. Native <div>s are not programmatically
    // focusable unless they have a tabindex.
    if (!container.hasAttribute("tabindex")) container.tabIndex = -1;

    const token = Symbol("overlay-dialog");
    overlayStack.push({ token, container });

    previousFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    // Background inert: ref-counted so stacked overlays release their own
    // marks without re-enabling the background while a sibling stays open.
    const targets = inertTargetsFor(container);
    for (const el of targets) {
      const next = (inertCounts.get(el) ?? 0) + 1;
      inertCounts.set(el, next);
      if (next === 1) el.setAttribute("inert", "");
    }
    inertedRef.current = targets;

    // An independently-mounted overlay can be rendered into a host that a
    // lower overlay already marked inert. Its own dialog must escape that
    // inherited inert subtree while it is topmost; the lower overlay's count
    // is preserved and restored when this one closes.
    const suspendedInertAncestors: HTMLElement[] = [];
    let ancestor = container.parentElement;
    while (ancestor && ancestor !== document.body) {
      if ((inertCounts.get(ancestor) ?? 0) > 0 && ancestor.hasAttribute("inert")) {
        ancestor.removeAttribute("inert");
        suspendedInertAncestors.push(ancestor);
      }
      ancestor = ancestor.parentElement;
    }
    suspendedInertAncestorsRef.current = suspendedInertAncestors;

    // Initial focus (§21): skip when something inside is already focused —
    // an explicit React autoFocus ran during commit and must win.
    const active = document.activeElement;
    if (!(active instanceof HTMLElement && container.contains(active))) {
      const mode = optionsRef.current.initialFocus ?? "first";
      const explicitTarget = typeof mode === "function" ? mode() : null;
      const target =
        explicitTarget ??
        (typeof mode === "function"
          ? (getFocusableElements(container)[0] ?? container)
          : mode === "container"
            ? container
            : (getFocusableElements(container)[0] ?? container));
      target?.focus();
    }

    function handleKeyDown(event: KeyboardEvent): void {
      // Stacked overlays: only the TOPMOST one reacts to keys.
      if (overlayStack[overlayStack.length - 1]?.token !== token) return;
      const current = containerRef.current;
      if (!current) return;

      if (event.key === "Escape") {
        optionsRef.current.onEscape?.();
        return;
      }
      if (event.key !== "Tab") return;

      const focusables = getFocusableElements(current);
      const activeEl = document.activeElement;
      const inside = activeEl instanceof Node && current.contains(activeEl);
      if (focusables.length === 0) {
        // Nothing focusable: keep the keyboard anchored to the container.
        event.preventDefault();
        current.focus();
        return;
      }
      const first = focusables[0]!;
      const last = focusables[focusables.length - 1]!;
      if (event.shiftKey) {
        if (!inside || activeEl === first || activeEl === current) {
          event.preventDefault();
          last.focus();
        }
        return;
      }
      if (!inside || activeEl === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      const index = overlayStack.findIndex((entry) => entry.token === token);
      if (index >= 0) overlayStack.splice(index, 1);

      // Release inert marks BEFORE restoring focus: a still-inert ancestor
      // would make the restore target unfocusable.
      for (const el of inertedRef.current) {
        const next = (inertCounts.get(el) ?? 1) - 1;
        if (next <= 0) {
          inertCounts.delete(el);
          el.removeAttribute("inert");
        } else {
          inertCounts.set(el, next);
        }
      }
      inertedRef.current = [];

      for (const ancestor of suspendedInertAncestorsRef.current) {
        if ((inertCounts.get(ancestor) ?? 0) > 0) ancestor.setAttribute("inert", "");
      }
      suspendedInertAncestorsRef.current = [];

      // Focus restore (§21): opener first, then a marked safe destination,
      // then the first focusable element in the document.
      const previous = previousFocusRef.current;
      previousFocusRef.current = null;
      const topmost = overlayStack[overlayStack.length - 1];
      if (topmost) {
        // An overlay remains open above this one: never return focus to the
        // background. Restore within that modal when possible, otherwise
        // anchor focus to its first control (or its container).
        if (previous?.isConnected && topmost.container.contains(previous)) {
          previous.focus();
        } else {
          (getFocusableElements(topmost.container)[0] ?? topmost.container).focus();
        }
        return;
      }
      if (previous?.isConnected && previous !== document.body) {
        previous.focus();
        return;
      }
      const fallback =
        document.querySelector<HTMLElement>("[data-overlay-restore-fallback]") ??
        getFocusableElements(document.body)[0] ??
        null;
      fallback?.focus();
    };
  }, [open, containerRef]);
}
