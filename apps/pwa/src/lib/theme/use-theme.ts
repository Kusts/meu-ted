"use client";

import { useContext } from "react";
import { ThemeContext } from "./theme-context";
import type { ThemeContextType } from "./types";

const defaultThemeContext: ThemeContextType = {
  theme: "dark",
  resolvedTheme: "dark",
  setTheme: () => {},
  toggleTheme: () => {},
};

export function useTheme(): ThemeContextType {
  const context = useContext(ThemeContext);
  if (!context) {
    return defaultThemeContext;
  }
  return context;
}
