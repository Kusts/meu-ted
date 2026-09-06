import { renderHook, act } from "@/lib/test-utils";
import { useHideBalance, HIDE_BALANCE_KEY } from "./useHideBalance";

describe("useHideBalance", () => {
  beforeEach(() => {
    window.localStorage.removeItem(HIDE_BALANCE_KEY);
  });

  it("starts visible and persists the toggle", () => {
    const { result } = renderHook(() => useHideBalance());
    expect(result.current.hidden).toBe(false);
    act(() => {
      result.current.toggle();
    });
    expect(result.current.hidden).toBe(true);
    expect(window.localStorage.getItem(HIDE_BALANCE_KEY)).toBe("1");

    act(() => {
      result.current.toggle();
    });
    expect(result.current.hidden).toBe(false);
    expect(window.localStorage.getItem(HIDE_BALANCE_KEY)).toBe("0");
  });

  it("restores a previously hidden balance", () => {
    window.localStorage.setItem(HIDE_BALANCE_KEY, "1");
    const { result } = renderHook(() => useHideBalance());
    expect(result.current.hidden).toBe(true);
  });

  it("syncs across hook instances on toggle", () => {
    const { result: a } = renderHook(() => useHideBalance());
    const { result: b } = renderHook(() => useHideBalance());
    act(() => {
      a.current.toggle();
    });
    expect(a.current.hidden).toBe(true);
    expect(b.current.hidden).toBe(true);
  });
});
