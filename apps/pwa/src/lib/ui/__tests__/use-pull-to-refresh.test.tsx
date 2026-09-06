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
  PULL_THRESHOLD_PX,
} from "../use-pull-to-refresh";

// ── doubles ──────────────────────────────────────────────────────

let coarse = true;
let reduceMotion = false;

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

function overscrollY(): string {
  return document.documentElement.style.getPropertyValue(
    "overscroll-behavior-y",
  );
}

describe("usePullToRefresh (v2 F4)", () => {
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

  it("dispara onRefresh uma vez após pull além do threshold", async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => usePullToRefresh({ onRefresh }));

    const [move] = pull(PULL_THRESHOLD_PX + 30);
    // preventDefault só após o threshold (listener passive:false).
    expect(move.defaultPrevented).toBe(true);
    expect(overscrollY()).toBe("none");
    expect(result.current.pullDistance).toBeGreaterThan(0);

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

    const [move] = pull(PULL_THRESHOLD_PX - 20);
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
    pull(PULL_THRESHOLD_PX + 30);
    await act(async () => {
      touch("touchend");
    });
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("não dispara sem touch ((pointer: coarse) unmatched)", async () => {
    coarse = false;
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    renderHook(() => usePullToRefresh({ onRefresh }));

    pull(PULL_THRESHOLD_PX + 30);
    await act(async () => {
      touch("touchend");
    });
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("não dispara fora do topo (scrollY > 0)", async () => {
    setScrollY(240);
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    renderHook(() => usePullToRefresh({ onRefresh }));

    pull(PULL_THRESHOLD_PX + 30);
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

    pull(PULL_THRESHOLD_PX + 30);
    await act(async () => {
      touch("touchend");
    });
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("dispara sob reduced-motion (contrato: atualiza, sem animar)", async () => {
    reduceMotion = true;
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    renderHook(() => usePullToRefresh({ onRefresh }));

    pull(PULL_THRESHOLD_PX + 30);
    await act(async () => {
      touch("touchend");
    });
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("emite haptics no disparo quando disponível", async () => {
    const vibrate = vi.fn().mockReturnValue(true);
    Object.defineProperty(window.navigator, "vibrate", {
      writable: true,
      configurable: true,
      value: vibrate,
    });
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    renderHook(() => usePullToRefresh({ onRefresh }));

    pull(PULL_THRESHOLD_PX + 30);
    await act(async () => {
      touch("touchend");
    });
    expect(vibrate).toHaveBeenCalledWith(10);
  });

  it("recupera-se quando onRefresh rejeita", async () => {
    const onRefresh = vi.fn().mockRejectedValue(new Error("offline"));
    const { result } = renderHook(() => usePullToRefresh({ onRefresh }));

    pull(PULL_THRESHOLD_PX + 30);
    await act(async () => {
      touch("touchend");
    });
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(result.current.isRefreshing).toBe(false);
    expect(result.current.pullDistance).toBe(0);
  });
});

describe("PullToRefreshIndicator (v2 F4)", () => {
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
    expect(container).toBeEmptyDOMElement();
  });

  it("mostra spinner esmeralda + Atualizando… durante o refresh", () => {
    render(
      <PullToRefreshIndicator
        state={{ pullDistance: 80, isRefreshing: true, refreshing: true }}
      />,
    );
    expect(screen.getByText("Atualizando…")).toBeInTheDocument();
    const spinner = document.querySelector("svg.animate-spin");
    expect(spinner).toBeInTheDocument();
  });

  it("orienta soltar quando armado e puxar quando abaixo do threshold", () => {
    const { rerender } = render(
      <PullToRefreshIndicator
        state={{
          pullDistance: PULL_THRESHOLD_PX + 10,
          isRefreshing: false,
          refreshing: false,
        }}
      />,
    );
    expect(screen.getByText("Solte para atualizar")).toBeInTheDocument();
    rerender(
      <PullToRefreshIndicator
        state={{
          pullDistance: PULL_THRESHOLD_PX - 10,
          isRefreshing: false,
          refreshing: false,
        }}
      />,
    );
    expect(screen.getByText("Puxe para atualizar")).toBeInTheDocument();
  });

  it("sob reduced-motion o indicador é estático (sem animate-spin)", () => {
    reduceMotion = true;
    render(
      <PullToRefreshIndicator
        state={{ pullDistance: 80, isRefreshing: true, refreshing: true }}
      />,
    );
    expect(screen.getByText("Atualizando…")).toBeInTheDocument();
    expect(document.querySelector("svg.animate-spin")).not.toBeInTheDocument();
  });
});
