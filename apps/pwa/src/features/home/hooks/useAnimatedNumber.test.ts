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

  it("sets the value directly under prefers-reduced-motion", async () => {
    stubMatchMedia(true);
    const { result, rerender } = renderHook(
      ({ target }) => useAnimatedNumber(target),
      { initialProps: { target: 1000 } },
    );
    rerender({ target: 5000 });
    // Snap é diferido (setTimeout 0) p/ cumprir set-state-in-effect.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    expect(result.current).toBe(5000);
  });

  it("animates mount in 500ms and updates in 320ms (expo-out)", () => {
    stubMatchMedia(false);
    let now = 0;
    performance.now = () => now;
    const callbacks: FrameRequestCallback[] = [];
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      callbacks.push(cb);
      return callbacks.length;
    }) as typeof requestAnimationFrame;
    globalThis.cancelAnimationFrame = (() => {}) as typeof cancelAnimationFrame;

    const { result, rerender } = renderHook(
      ({ target }) => useAnimatedNumber(target),
      { initialProps: { target: 1000 } },
    );
    expect(callbacks).toHaveLength(1);

    // Mount (500ms): t=0.5 → expo 1-2^-5 = 0.96875 → 969.
    act(() => {
      now = 250;
      callbacks[0]!(250);
    });
    expect(result.current).toBe(969);

    // Mount completa no fim dos 500ms.
    act(() => {
      now = 600;
      callbacks[1]!(600);
    });
    expect(result.current).toBe(1000);

    // Update (320ms): de 1000 → 2000, t=0.5 → 1000 + 969 = 1969.
    rerender({ target: 2000 });
    act(() => {
      now = 600 + 160;
      callbacks[2]!(760);
    });
    expect(result.current).toBe(1969);

    act(() => {
      now = 600 + 320;
      callbacks[3]!(920);
    });
    expect(result.current).toBe(2000);
  });

  it("falls back to a direct set without requestAnimationFrame", async () => {
    stubMatchMedia(false);
    vi.stubGlobal("requestAnimationFrame", undefined);
    const { result, rerender } = renderHook(
      ({ target }) => useAnimatedNumber(target),
      { initialProps: { target: 100 } },
    );
    rerender({ target: 900 });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    expect(result.current).toBe(900);
  });
});
