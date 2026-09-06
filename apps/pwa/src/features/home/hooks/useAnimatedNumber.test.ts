import { renderHook, act } from "@/lib/test-utils";
import { useAnimatedNumber } from "./useAnimatedNumber";

function stubMatchMedia(matches: boolean) {
  window.matchMedia = vi.fn().mockReturnValue({
    matches,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }) as unknown as typeof window.matchMedia;
}

describe("useAnimatedNumber", () => {
  const realRaf = globalThis.requestAnimationFrame;
  const realCaf = globalThis.cancelAnimationFrame;
  const realNow = performance.now;

  afterEach(() => {
    globalThis.requestAnimationFrame = realRaf;
    globalThis.cancelAnimationFrame = realCaf;
    performance.now = realNow;
    vi.restoreAllMocks();
  });

  it("sets the value directly under prefers-reduced-motion", () => {
    stubMatchMedia(true);
    const { result, rerender } = renderHook(
      ({ target }) => useAnimatedNumber(target),
      { initialProps: { target: 1000 } },
    );
    rerender({ target: 5000 });
    expect(result.current).toBe(5000);
  });

  it("animates with cubic ease-out across driven frames", () => {
    stubMatchMedia(false);
    let now = 0;
    performance.now = () => now;
    const callbacks: FrameRequestCallback[] = [];
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      callbacks.push(cb);
      return callbacks.length;
    }) as typeof requestAnimationFrame;
    globalThis.cancelAnimationFrame = (() => {}) as typeof cancelAnimationFrame;

    const { result } = renderHook(() => useAnimatedNumber(1000, 600));
    expect(callbacks).toHaveLength(1);

    // Mid-frame t=0.5 → eased 1-(0.5)^3 = 0.875 → 875.
    act(() => {
      now = 300;
      callbacks[0]!(300);
    });
    expect(result.current).toBe(875);

    // Final frame clamps to the target.
    act(() => {
      now = 900;
      callbacks[1]!(900);
    });
    expect(result.current).toBe(1000);
  });

  it("falls back to a direct set without requestAnimationFrame", () => {
    stubMatchMedia(false);
    vi.stubGlobal("requestAnimationFrame", undefined);
    const { result, rerender } = renderHook(
      ({ target }) => useAnimatedNumber(target),
      { initialProps: { target: 100 } },
    );
    rerender({ target: 900 });
    expect(result.current).toBe(900);
  });
});
