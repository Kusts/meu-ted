import { haptic } from "./haptics";

function stubMatchMedia(matches: boolean) {
  window.matchMedia = vi.fn().mockReturnValue({
    matches,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }) as unknown as typeof window.matchMedia;
}

describe("lib/ui/haptics", () => {
  it("vibrates with the given pattern", () => {
    stubMatchMedia(false);
    const vibrate = vi.fn().mockReturnValue(true);
    Object.defineProperty(window.navigator, "vibrate", {
      configurable: true,
      value: vibrate,
    });
    haptic(8);
    expect(vibrate).toHaveBeenCalledWith(8);
  });

  it("is a noop under prefers-reduced-motion", () => {
    stubMatchMedia(true);
    const vibrate = vi.fn().mockReturnValue(true);
    Object.defineProperty(window.navigator, "vibrate", {
      configurable: true,
      value: vibrate,
    });
    haptic(12);
    expect(vibrate).not.toHaveBeenCalled();
  });
});
