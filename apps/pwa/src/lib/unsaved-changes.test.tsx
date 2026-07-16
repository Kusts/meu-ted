import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { UnsavedChangesProvider, useUnsavedChanges } from "./unsaved-changes";

describe("UnsavedChangesContext", () => {
  it("starts clean (not dirty)", () => {
    const { result } = renderHook(() => useUnsavedChanges(), {
      wrapper: UnsavedChangesProvider,
    });
    expect(result.current.isDirty).toBe(false);
  });

  it("trackWrite returns cleanup that marks clean after dirty", () => {
    const { result } = renderHook(() => useUnsavedChanges(), {
      wrapper: UnsavedChangesProvider,
    });
    let cleanup: () => void;
    act(() => {
      cleanup = result.current.trackWrite();
    });
    expect(result.current.isDirty).toBe(true);

    act(() => {
      cleanup!();
    });
    expect(result.current.isDirty).toBe(false);
  });

  it("multiple concurrent writes tracked independently", () => {
    const { result } = renderHook(() => useUnsavedChanges(), {
      wrapper: UnsavedChangesProvider,
    });
    let c1: () => void, c2: () => void;
    act(() => { c1 = result.current.trackWrite(); });
    act(() => { c2 = result.current.trackWrite(); });
    expect(result.current.isDirty).toBe(true);

    act(() => { c1(); });
    expect(result.current.isDirty).toBe(true);

    act(() => { c2(); });
    expect(result.current.isDirty).toBe(false);
  });

  it("cleanup is idempotent (calling twice does not double-clean)", () => {
    const { result } = renderHook(() => useUnsavedChanges(), {
      wrapper: UnsavedChangesProvider,
    });
    let cleanup: () => void;
    act(() => { cleanup = result.current.trackWrite(); });
    expect(result.current.isDirty).toBe(true);

    act(() => { cleanup(); });
    expect(result.current.isDirty).toBe(false);

    act(() => { cleanup(); });
    expect(result.current.isDirty).toBe(false);
  });
});
