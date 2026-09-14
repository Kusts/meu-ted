import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, renderHook, act } from "@/lib/test-utils";
import {
  acquireBodyScrollLock,
  releaseBodyScrollLock,
  bodyScrollLockCount,
} from "../overlay-a11y";
import {
  usePullToRefresh,
  PullToRefreshIndicator,
  hasScrolledAncestor,
  PULL_THRESHOLD_PX,
  PULL_DAMPING,
  PULL_ANCHORED_PX,
} from "../use-pull-to-refresh";

// ── doubles ──────────────────────────────────────────────────────

let coarse = true;
let reduceMotion = false;

/** dy cru com damping 0.45 que arma o threshold de 64px (160*0.45=72). */
const TRIGGER_DY = 160;
/** dy cru que fica abaixo do threshold (100*0.45=45). */
const SHORT_DY = 100;

function installMatchMedia() {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches:
        query === "(pointer: coarse)"
          ? coarse
          : query === "(prefers-reduced-motion: reduce)"
            ? reduceMotion
            : false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: () => false,
    }),
  });
}

function setScrollY(px: number) {
  Object.defineProperty(window, "scrollY", {
    writable: true,
    configurable: true,
    value: px,
  });
}

interface TestTouch {
  clientX: number;
  clientY: number;
  identifier: number;
}

function touch(
  type: "touchstart" | "touchmove" | "touchend",
  points: { x: number; y: number }[] = [],
): Event {
  const ev = new Event(type, { bubbles: true, cancelable: true });
  const touches: TestTouch[] = points.map((p, i) => ({
    clientX: p.x,
    clientY: p.y,
    identifier: i,
  }));
  (ev as unknown as { touches: TestTouch[] }).touches = touches;
  (ev as unknown as { changedTouches: TestTouch[] }).changedTouches = touches;
  act(() => {
    window.dispatchEvent(ev);
  });
  return ev;
}

/** Gesto de pull vertical completo partindo do topo. */
function pull(distance: number): Event[] {
  touch("touchstart", [{ x: 100, y: 120 }]);
  const move = touch("touchmove", [{ x: 100, y: 120 + distance }]);
  return [move];
}

/** Despacha o toque num alvo específico (borbulha até o listener no window). */
function touchOn(
  target: EventTarget,
  type: "touchstart" | "touchmove" | "touchend",
  points: { x: number; y: number }[] = [],
): Event {
  const ev = new Event(type, { bubbles: true, cancelable: true });
  const touches = points.map((p, i) => ({
    clientX: p.x,
    clientY: p.y,
    identifier: i,
  }));
  (ev as unknown as { touches: unknown }).touches = touches;
  (ev as unknown as { changedTouches: unknown }).changedTouches = touches;
  act(() => {
    target.dispatchEvent(ev);
  });
  return ev;
}

/** Container interno overflow-y-auto com scrollTop controlável. */
function mountScroller(scrollTop: number): { root: HTMLElement; inner: HTMLElement } {
  const root = document.createElement("div");
  root.style.overflowY = "auto";
  Object.defineProperty(root, "scrollTop", {
    configurable: true,
    value: scrollTop,
  });
  const inner = document.createElement("div");
  inner.textContent = "item";
  root.appendChild(inner);
  document.body.appendChild(root);
  return { root, inner };
}

function overscrollY(): string {
  return document.documentElement.style.getPropertyValue(
    "overscroll-behavior-y",
  );
}

describe("usePullToRefresh (v2 F4, spec AGY §3)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    coarse = true;
    reduceMotion = false;
    installMatchMedia();
    setScrollY(0);
    document.documentElement.style.removeProperty("overscroll-behavior-y");
    while (bodyScrollLockCount() > 0) releaseBodyScrollLock();
  });

  afterEach(() => {
    while (bodyScrollLockCount() > 0) releaseBodyScrollLock();
    document.documentElement.style.removeProperty("overscroll-behavior-y");
    setScrollY(0);
  });

  it("aplica damping 0.45 e dispara onRefresh uma vez além do threshold", async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => usePullToRefresh({ onRefresh }));

    const [move] = pull(TRIGGER_DY);
    // preventDefault só após o threshold (listener passive:false).
    expect(move.defaultPrevented).toBe(true);
    expect(overscrollY()).toBe("none");
    expect(result.current.pullDistance).toBeCloseTo(TRIGGER_DY * PULL_DAMPING, 5);

    await act(async () => {
      touch("touchend");
    });
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(result.current.isRefreshing).toBe(false);
    expect(result.current.refreshing).toBe(false);
    expect(result.current.pullDistance).toBe(0);
    expect(overscrollY()).toBe("");
  });

  it("não previne nem dispara em pull curto (abaixo do threshold)", async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    renderHook(() => usePullToRefresh({ onRefresh }));

    const [move] = pull(SHORT_DY);
    expect(move.defaultPrevented).toBe(false);
    expect(overscrollY()).toBe("");

    await act(async () => {
      touch("touchend");
    });
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("não dispara com overlay aberto", async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    renderHook(() => usePullToRefresh({ onRefresh }));

    act(() => acquireBodyScrollLock());
    pull(TRIGGER_DY);
    await act(async () => {
      touch("touchend");
    });
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("não dispara sem touch ((pointer: coarse) unmatched)", async () => {
    coarse = false;
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    renderHook(() => usePullToRefresh({ onRefresh }));

    pull(TRIGGER_DY);
    await act(async () => {
      touch("touchend");
    });
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("não dispara fora do topo (scrollY > 0)", async () => {
    setScrollY(240);
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    renderHook(() => usePullToRefresh({ onRefresh }));

    pull(TRIGGER_DY);
    await act(async () => {
      touch("touchend");
    });
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("não dispara em gesto horizontal", async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    renderHook(() => usePullToRefresh({ onRefresh }));

    touch("touchstart", [{ x: 300, y: 200 }]);
    const move = touch("touchmove", [{ x: 120, y: 210 }]);
    expect(move.defaultPrevented).toBe(false);
    await act(async () => {
      touch("touchend");
    });
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("respeita enabled=false", async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    renderHook(() => usePullToRefresh({ onRefresh, enabled: false }));

    pull(TRIGGER_DY);
    await act(async () => {
      touch("touchend");
    });
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("dispara sob reduced-motion (contrato: atualiza, sem animar nem vibrar)", async () => {
    reduceMotion = true;
    const vibrate = vi.fn().mockReturnValue(true);
    Object.defineProperty(window.navigator, "vibrate", {
      writable: true,
      configurable: true,
      value: vibrate,
    });
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    renderHook(() => usePullToRefresh({ onRefresh }));

    pull(TRIGGER_DY);
    await act(async () => {
      touch("touchend");
    });
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(vibrate).not.toHaveBeenCalled();
  });

  it("emite o micro-haptic uma vez ao cruzar o threshold", async () => {
    const vibrate = vi.fn().mockReturnValue(true);
    Object.defineProperty(window.navigator, "vibrate", {
      writable: true,
      configurable: true,
      value: vibrate,
    });
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    renderHook(() => usePullToRefresh({ onRefresh }));

    pull(TRIGGER_DY);
    // Haptic dispara no cruzamento (move), antes do touchend.
    expect(vibrate).toHaveBeenCalledTimes(1);
    expect(vibrate).toHaveBeenCalledWith(12);
    await act(async () => {
      touch("touchend");
    });
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(vibrate).toHaveBeenCalledTimes(1);
  });

  it("recupera-se quando onRefresh rejeita", async () => {
    const onRefresh = vi.fn().mockRejectedValue(new Error("offline"));
    const { result } = renderHook(() => usePullToRefresh({ onRefresh }));

    pull(TRIGGER_DY);
    await act(async () => {
      touch("touchend");
    });
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(result.current.isRefreshing).toBe(false);
    expect(result.current.pullDistance).toBe(0);
  });

  it("não arma quando o gesto nasce em container interno rolado", async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    renderHook(() => usePullToRefresh({ onRefresh }));
    const { root, inner } = mountScroller(120);
    try {
      touchOn(inner, "touchstart", [{ x: 100, y: 120 }]);
      touchOn(inner, "touchmove", [{ x: 100, y: 120 + TRIGGER_DY }]);
      await act(async () => {
        touchOn(inner, "touchend");
      });
      expect(onRefresh).not.toHaveBeenCalled();
      expect(overscrollY()).toBe("");
    } finally {
      root.remove();
    }
  });

  it("permite o pull quando o container interno está no topo", async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    renderHook(() => usePullToRefresh({ onRefresh }));
    const { root, inner } = mountScroller(0);
    try {
      touchOn(inner, "touchstart", [{ x: 100, y: 120 }]);
      touchOn(inner, "touchmove", [{ x: 100, y: 120 + TRIGGER_DY }]);
      await act(async () => {
        touchOn(inner, "touchend");
      });
      expect(onRefresh).toHaveBeenCalledTimes(1);
    } finally {
      root.remove();
    }
  });
});

describe("hasScrolledAncestor", () => {
  it("detecta ancestral overflow-y rolado", () => {
    const { root, inner } = mountScroller(48);
    try {
      expect(hasScrolledAncestor(inner)).toBe(true);
    } finally {
      root.remove();
    }
  });

  it("libera ancestral no topo, sem scroll e alvos nulos", () => {
    const { root, inner } = mountScroller(0);
    try {
      expect(hasScrolledAncestor(inner)).toBe(false);
    } finally {
      root.remove();
    }
    const plain = document.createElement("div");
    document.body.appendChild(plain);
    try {
      expect(hasScrolledAncestor(plain)).toBe(false);
    } finally {
      plain.remove();
    }
    expect(hasScrolledAncestor(null)).toBe(false);
    expect(hasScrolledAncestor(window)).toBe(false);
  });
});

describe("PullToRefreshIndicator (spec AGY §3)", () => {
  beforeEach(() => {
    coarse = true;
    reduceMotion = false;
    installMatchMedia();
  });

  it("não renderiza quando ocioso", () => {
    const { container } = render(
      <PullToRefreshIndicator
        state={{ pullDistance: 0, isRefreshing: false, refreshing: false }}
      />,
    );
    expect(container).toBeEmpty();
  });

  it("cápsula 36px com arco esmeralda 2.5px e tokens de superfície", () => {
    render(
      <PullToRefreshIndicator
        state={{
          pullDistance: PULL_THRESHOLD_PX / 2,
          isRefreshing: false,
          refreshing: false,
        }}
      />,
    );
    const capsule = screen.getByTestId("ptr-capsule");
    expect(capsule.className).toMatch(/h-9 w-9/);
    expect(capsule.className).toMatch(/rounded-full/);
    expect(capsule.className).toMatch(/shadow-elevated/);
    const style = capsule.getAttribute("style") ?? "";
    expect(style).toContain("var(--ptr-capsule-bg)");
    expect(style).toContain("var(--ptr-capsule-border)");
    const arc = screen.getByTestId("ptr-arc");
    // className de SVG é SVGAnimatedString: ler via getAttribute.
    expect(arc.getAttribute("class") ?? "").toContain("text-primary");
    expect(arc.getAttribute("stroke-width")).toBe("2.5");
  });

  it("rotação 0→180° e opacidade 0.3→0.9 proporcionais ao arrasto", () => {
    render(
      <PullToRefreshIndicator
        state={{
          pullDistance: PULL_THRESHOLD_PX / 2,
          isRefreshing: false,
          refreshing: false,
        }}
      />,
    );
    const arc = screen.getByTestId("ptr-arc");
    expect((arc as unknown as SVGElement).style.transform).toContain(
      "rotate(90deg)",
    );
    expect(screen.getByRole("status").style.opacity).toBe("0.6");
  });

  it("no threshold: escala 105% e arco money", () => {
    render(
      <PullToRefreshIndicator
        state={{
          pullDistance: PULL_THRESHOLD_PX + 8,
          isRefreshing: false,
          refreshing: false,
        }}
      />,
    );
    const capsule = screen.getByTestId("ptr-capsule");
    expect(capsule.style.transform).toContain("scale(1.05)");
    expect(screen.getByTestId("ptr-arc").getAttribute("class") ?? "").toContain(
      "text-accent-money",
    );
  });

  it("refreshing ancora a 52px com rotação contínua", () => {
    render(
      <PullToRefreshIndicator
        state={{ pullDistance: 72, isRefreshing: true, refreshing: true }}
      />,
    );
    expect(screen.getByRole("status").style.height).toBe(
      `${PULL_ANCHORED_PX}px`,
    );
    const arc = screen.getByTestId("ptr-arc");
    const arcClass = arc.getAttribute("class") ?? "";
    expect(arcClass).toContain("animate-spin");
    expect(arcClass).toContain("text-primary");
  });

  it("sob reduced-motion o indicador é estático (sem spin/escala/rotação)", () => {
    reduceMotion = true;
    render(
      <PullToRefreshIndicator
        state={{
          pullDistance: PULL_THRESHOLD_PX + 8,
          isRefreshing: true,
          refreshing: true,
        }}
      />,
    );
    const arc = screen.getByTestId("ptr-arc");
    expect(arc.getAttribute("class") ?? "").not.toContain("animate-spin");
    expect(arc.style.transform).toBe("");
    expect(screen.getByTestId("ptr-capsule").style.transform).toBe("");
  });

  describe("retração 200ms (spec AGY §3)", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("recolhe para o topo em 200ms antes de desmontar", () => {
      const { container, rerender } = render(
        <PullToRefreshIndicator
          state={{ pullDistance: 72, isRefreshing: true, refreshing: true }}
        />,
      );
      expect(screen.getByRole("status")).toBeInTheDocument();

      rerender(
        <PullToRefreshIndicator
          state={{ pullDistance: 0, isRefreshing: false, refreshing: false }}
        />,
      );
      // Ainda montado, colapsando (altura 0 + transição de 200ms).
      const status = screen.getByRole("status");
      expect(status.style.height).toBe("0px");
      expect(status.style.transition).toContain("200ms");
      expect(status.style.transition).toContain("var(--easing-standard)");

      act(() => {
        vi.advanceTimersByTime(200);
      });
      expect(container).toBeEmpty();
    });

    it("sob reduced-motion some imediatamente, sem retração", () => {
      reduceMotion = true;
      const { container, rerender } = render(
        <PullToRefreshIndicator
          state={{ pullDistance: 72, isRefreshing: true, refreshing: true }}
        />,
      );
      rerender(
        <PullToRefreshIndicator
          state={{ pullDistance: 0, isRefreshing: false, refreshing: false }}
        />,
      );
      expect(container).toBeEmpty();
    });
  });
});
