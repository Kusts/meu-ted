/** Design system tokens — mirrors CSS custom properties from globals.css */

export const colors = {
  primary: "#0E8C5A",
  primaryDark: "#0A3A28",
  primaryMid: "#0F6B45",
  primaryLight: "#2FA56F",
  primaryTint: "#E7F3EC",

  danger: "#C8483B",
  dangerTint: "#F7E9E7",
  warning: "#B8791F",
  warningTint: "#FBF1E3",
  info: "#3E6FB0",
  infoTint: "#E8EFF7",

  bg: "#F7F8F5",
  surface: "#FFFFFF",
  border: "#ECEEEA",
  borderStrong: "#E0E3DE",
  textPrimary: "#16201A",
  textSecondary: "#5C665E",
  textMuted: "#98A29A",
  fillLight: "#F4F5F2",
  fillMedium: "#F1F3EF",
} as const;

export type ColorKey = keyof typeof colors;

export const font = {
  ui: "var(--font-plus-jakarta-sans), 'Plus Jakarta Sans', sans-serif",
  mono: "var(--font-space-grotesk), 'Space Grotesk', monospace",
} as const;

export const spacing = {
  pagePadding: 20,
  pagePt: 14,
  pagePb: 24,
  tabBarHeight: 72,
  statusBarH: 44,
} as const;

export const radius = {
  card: 16,
  sheet: "26px 26px 0 0",
  btn: 100,
  input: 13,
  chip: 100,
} as const;

export const shadow = {
  card: "0 1px 3px rgba(0,0,0,.06)",
  sheet: "0 -4px 24px rgba(10,30,20,.12)",
  fab: "0 4px 18px rgba(14,140,90,.35)",
} as const;

export const animation = {
  duration: "0.28s",
  easing: "cubic-bezier(.2,.8,.2,1)",
  sheetUp: "sheetUp 0.28s cubic-bezier(.2,.8,.2,1)",
  fadeIn: "fadeIn 0.25s ease",
} as const;

export const breakpoints = {
  mobile: 390,
} as const;

/** Utility: resolve a color key to its hex value */
export function color(key: ColorKey): string {
  return colors[key];
}
