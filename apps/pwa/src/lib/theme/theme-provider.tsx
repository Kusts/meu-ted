"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ThemeContext } from "./theme-context";
import type { ResolvedTheme, Theme, ThemeProviderProps } from "./types";

export const THEME_STORAGE_KEY = "pi-theme";

function getSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined" || !window.matchMedia) return "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function getStoredTheme(storageKey: string, defaultTheme: Theme): Theme {
  if (typeof window === "undefined") return defaultTheme;
  try {
    const stored = localStorage.getItem(storageKey);
    if (stored === "dark" || stored === "light" || stored === "system") {
      return stored;
    }
  } catch {
    /* noop */
  }
  return defaultTheme;
}

export function ThemeProvider({
  children,
  // P2-13: with no stored preference, follow prefers-color-scheme (light or dark).
  defaultTheme = "system",
  storageKey = THEME_STORAGE_KEY,
}: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>(() =>
    getStoredTheme(storageKey, defaultTheme)
  );
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(() =>
    getSystemTheme()
  );

  // Listen for system theme media query changes
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");

    const handleChange = (e: MediaQueryListEvent | { matches: boolean }) => {
      setSystemTheme(e.matches ? "dark" : "light");
    };

    if (media.addEventListener) {
      media.addEventListener("change", handleChange);
      return () => media.removeEventListener("change", handleChange);
    } else if (media.addListener) {
      media.addListener(handleChange);
      return () => media.removeListener(handleChange);
    }
  }, []);

  const resolvedTheme: ResolvedTheme = useMemo(() => {
    if (theme === "system") return systemTheme;
    return theme;
  }, [theme, systemTheme]);

  // Apply theme to <html> element
  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(resolvedTheme);
    root.style.colorScheme = resolvedTheme;
  }, [resolvedTheme]);

  const setTheme = useCallback(
    (newTheme: Theme) => {
      setThemeState(newTheme);
      try {
        localStorage.setItem(storageKey, newTheme);
      } catch {
        /* noop */
      }
    },
    [storageKey]
  );

  const toggleTheme = useCallback(() => {
    setTheme(resolvedTheme === "dark" ? "light" : "dark");
  }, [resolvedTheme, setTheme]);

  const value = useMemo(
    () => ({
      theme,
      resolvedTheme,
      setTheme,
      toggleTheme,
    }),
    [theme, resolvedTheme, setTheme, toggleTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
