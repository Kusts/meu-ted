/**
 * Shared SVG icon registry.
 *
 * Usage: <Icon name="home" size={22} color="currentColor" />
 * All icons use 24×24 viewBox with strokeWidth=1.9 unless overridden.
 */

import type { SVGProps } from "react";

export type IconName =
  | "home"
  | "records"
  | "payables"
  | "more"
  | "plus"
  | "chevron-right"
  | "chevron-left"
  | "bell"
  | "user"
  | "shield"
  | "credit-card"
  | "wallet"
  | "chart"
  | "target"
  | "tag"
  | "folder-open"
  | "trend-up"
  | "trend-down"
  | "exchange"
  | "circle-plus"
  | "circle-minus"
  | "info"
  | "alert-triangle"
  | "check"
  | "x"
  | "arrow-up-right"
  | "arrow-down-left";

interface IconProps extends SVGProps<SVGSVGElement> {
  name: IconName;
  size?: number;
}

const PATHS: Record<IconName, React.ReactNode> = {
  home: (
    <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
  ),
  records: (
    <>
      <path d="M8 6h13M8 12h13M8 18h13" />
      <path d="M3 6h.01M3 12h.01M3 18h.01" />
    </>
  ),
  payables: (
    <>
      <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z" />
      <path d="M8 7h8M8 11h8M8 15h5" />
    </>
  ),
  more: (
    <>
      <circle cx="5" cy="12" r="1" fill="currentColor" />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
      <circle cx="19" cy="12" r="1" fill="currentColor" />
    </>
  ),
  plus: (
    <path d="M12 5v14M5 12h14" />
  ),
  "chevron-right": (
    <path d="m9 6 6 6-6 6" />
  ),
  "chevron-left": (
    <path d="m15 18-6-6 6-6" />
  ),
  bell: (
    <>
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
    </>
  ),
  shield: (
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  ),
  "credit-card": (
    <>
      <rect x="2" y="5" width="20" height="14" rx="2.5" />
      <path d="M2 10h20" />
    </>
  ),
  wallet: (
    <>
      <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </>
  ),
  chart: (
    <>
      <path d="M3 3v18h18" />
      <path d="m19 9-5 5-4-4-3 3" />
    </>
  ),
  target: (
    <circle cx="12" cy="12" r="9" />
  ),
  tag: (
    <path d="M7.5 3h9L21 9l-9 12L3 9z" />
  ),
  "folder-open": (
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
  ),
  "trend-up": (
    <>
      <path d="M23 6 13.5 15.5 8.5 10.5 1 18" />
      <path d="M17 6h6v6" />
    </>
  ),
  "trend-down": (
    <>
      <path d="M23 18 13.5 8.5 8.5 13.5 1 6" />
      <path d="M17 18h6v-6" />
    </>
  ),
  exchange: (
    <path d="M8 3 4 7l4 4M4 7h16M16 21l4-4-4-4M20 17H4" />
  ),
  "circle-plus": (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M8 12h8M12 8v8" />
    </>
  ),
  "circle-minus": (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M8 12h8" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 8v4M12 16h.01" />
    </>
  ),
  "alert-triangle": (
    <>
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <path d="M12 9v4M12 17h.01" />
    </>
  ),
  check: (
    <path d="M20 6 9 17l-5-5" />
  ),
  x: (
    <path d="M18 6 6 18M6 6l12 12" />
  ),
  "arrow-up-right": (
    <path d="M7 17 17 7M7 7h10v10" />
  ),
  "arrow-down-left": (
    <path d="M17 17 7 7M17 7H7v10" />
  ),
};

export default function Icon({ name, size = 22, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {PATHS[name]}
    </svg>
  );
}
