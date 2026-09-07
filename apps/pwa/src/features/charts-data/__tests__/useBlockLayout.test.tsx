import { describe, expect, it, beforeEach } from "vitest";
import { renderHook, act } from "@/lib/test-utils";
import { clampLayout, useBlockLayout } from "../useBlockLayout";

const DEFAULTS = ["a", "b", "c"];

describe("clampLayout", () => {
  it("usa o default quando o storage está vazio ou corrompido", () => {
    expect(clampLayout(null, DEFAULTS)).toEqual({ order: ["a", "b", "c"], hidden: [] });
    expect(clampLayout("lixo", DEFAULTS)).toEqual({ order: ["a", "b", "c"], hidden: [] });
    expect(clampLayout({}, DEFAULTS)).toEqual({ order: ["a", "b", "c"], hidden: [] });
  });

  it("ignora ids desconhecidos e anexa blocos novos visíveis no fim", () => {
    expect(
      clampLayout({ order: ["b", "x", "a"], hidden: ["c", "y"] }, ["a", "b", "c", "d"]),
    ).toEqual({ order: ["b", "a", "c", "d"], hidden: ["c"] });
  });
});

describe("useBlockLayout", () => {
  const KEY = "meu-ted:test-blocks";

  beforeEach(() => {
    window.localStorage.removeItem(KEY);
  });

  it("oculta/reexibe e persiste entre remounts", () => {
    const { result, unmount } = renderHook(() => useBlockLayout(KEY, DEFAULTS));
    expect(result.current.visible).toEqual(["a", "b", "c"]);

    act(() => result.current.toggle("b"));
    expect(result.current.visible).toEqual(["a", "c"]);

    unmount();
    const second = renderHook(() => useBlockLayout(KEY, DEFAULTS));
    expect(second.result.current.visible).toEqual(["a", "c"]);

    act(() => second.result.current.toggle("b"));
    expect(second.result.current.visible).toEqual(["a", "b", "c"]);
  });

  it("reordena para cima/baixo com limites", () => {
    const { result } = renderHook(() => useBlockLayout(KEY, DEFAULTS));
    act(() => result.current.move("c", -1));
    expect(result.current.visible).toEqual(["a", "c", "b"]);
    act(() => result.current.move("a", -1));
    expect(result.current.visible).toEqual(["a", "c", "b"]);
    act(() => result.current.move("a", 1));
    expect(result.current.visible).toEqual(["c", "a", "b"]);
  });

  it("reset restaura o default", () => {
    const { result } = renderHook(() => useBlockLayout(KEY, DEFAULTS));
    act(() => result.current.toggle("a"));
    act(() => result.current.move("c", -1));
    act(() => result.current.reset());
    expect(result.current.visible).toEqual(["a", "b", "c"]);
  });
});
