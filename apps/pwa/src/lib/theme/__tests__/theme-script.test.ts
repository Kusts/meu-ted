import { describe, it, expect, beforeEach } from "vitest";
import { THEME_SCRIPT } from "../theme-script";

function runThemeScript(): void {
  new Function(THEME_SCRIPT)();
}

describe("THEME_SCRIPT (P2-13)", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = "";
    document.documentElement.style.colorScheme = "";
  });

  it("respects prefers-color-scheme light when nothing is stored", () => {
    window.matchMedia = window.matchMedia ?? (() => ({ matches: false } as MediaQueryList));
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
    })) as unknown as typeof window.matchMedia;

    runThemeScript();

    expect(document.documentElement.classList.contains("light")).toBe(true);
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(document.documentElement.style.colorScheme).toBe("light");
    window.matchMedia = original;
  });

  it("respects prefers-color-scheme dark when nothing is stored", () => {
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: true,
      media: query,
    })) as unknown as typeof window.matchMedia;

    runThemeScript();

    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.style.colorScheme).toBe("dark");
    window.matchMedia = original;
  });

  it("stored preference wins over the system preference", () => {
    localStorage.setItem("pi-theme", "dark");
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
    })) as unknown as typeof window.matchMedia;

    runThemeScript();

    expect(document.documentElement.classList.contains("dark")).toBe(true);
    window.matchMedia = original;
  });
});