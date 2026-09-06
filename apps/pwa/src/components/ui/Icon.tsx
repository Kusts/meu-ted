"use client";

import type { LucideProps } from "lucide-react";
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  BarChart3,
  Bell,
  CalendarClock,
  Check,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  FileText,
  FolderOpen,
  Home,
  Info,
  Layers,
  MinusCircle,
  MoreHorizontal,
  PieChart,
  Plus,
  PlusCircle,
  Receipt,
  Shield,
  Tag,
  Target,
  TrendingDown,
  TrendingUp,
  User,
  Wallet,
  X,
} from "lucide-react";

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
  | "pie-chart"
  | "file-text"
  | "layers"
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

export interface IconProps extends Omit<LucideProps, "ref"> {
  name: IconName;
  size?: number | string;
}

const ICON_MAP: Record<IconName, React.ComponentType<LucideProps>> = {
  home: Home,
  records: Receipt,
  payables: CalendarClock,
  more: MoreHorizontal,
  plus: Plus,
  "chevron-right": ChevronRight,
  "chevron-left": ChevronLeft,
  bell: Bell,
  user: User,
  shield: Shield,
  "credit-card": CreditCard,
  wallet: Wallet,
  chart: BarChart3,
  "pie-chart": PieChart,
  "file-text": FileText,
  layers: Layers,
  target: Target,
  tag: Tag,
  "folder-open": FolderOpen,
  "trend-up": TrendingUp,
  "trend-down": TrendingDown,
  exchange: ArrowLeftRight,
  "circle-plus": PlusCircle,
  "circle-minus": MinusCircle,
  info: Info,
  "alert-triangle": AlertTriangle,
  check: Check,
  x: X,
  "arrow-up-right": ArrowUpRight,
  "arrow-down-left": ArrowDownLeft,
};

export function Icon({ name, size = 22, strokeWidth = 1.9, className = "", ...props }: IconProps) {
  const Component = ICON_MAP[name] || Info;
  return (
    <Component
      size={size}
      strokeWidth={strokeWidth}
      className={className}
      {...props}
    />
  );
}

export default Icon;
