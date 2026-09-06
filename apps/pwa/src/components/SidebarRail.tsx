"use client";

import Link from "next/link";
import Image from "next/image";
import type { ComponentType } from "react";
import { usePathname } from "next/navigation";
import { useTheme } from "@/lib/theme";
import { WorkspaceSwitcher } from "@/components/WorkspaceSwitcher";
import { Button } from "@/components/ui/Button";
import {
  Moon,
  Sun,
  Plus,
  Home,
  Receipt,
  CalendarClock,
  CreditCard,
  Wallet,
  BarChart3,
  Target,
  Tag,
  FolderOpen,
  TriangleAlert,
  Bell,
  Shield,
  User,
  type LucideProps,
} from "lucide-react";

export interface SidebarRailProps {
  onNewTransaction: () => void;
  className?: string;
}

interface NavItemDef {
  label: string;
  href: string;
  icon: ComponentType<LucideProps>;
}

const PRIMARY_NAV: NavItemDef[] = [
  { label: "Resumo", href: "/", icon: Home },
  { label: "Registros", href: "/registros", icon: Receipt },
  { label: "A pagar", href: "/a-pagar", icon: CalendarClock },
  { label: "Cartões", href: "/cartoes", icon: CreditCard },
  { label: "Contas", href: "/contas", icon: Wallet },
  { label: "Orçamentos", href: "/orcamentos", icon: BarChart3 },
  { label: "Metas", href: "/metas", icon: Target },
  { label: "Patrimônio", href: "/patrimonio", icon: Wallet },
];

const SECONDARY_NAV: NavItemDef[] = [
  { label: "Assinaturas", href: "/assinaturas", icon: Tag },
  { label: "Categorias", href: "/categorias", icon: FolderOpen },
  { label: "Workspaces", href: "/workspaces", icon: FolderOpen },
  { label: "Aprovações", href: "/pending", icon: TriangleAlert },
  { label: "Alertas", href: "/alerts/price", icon: Bell },
  { label: "Auditoria", href: "/audit", icon: Shield },
];

export function SidebarRail({
  onNewTransaction,
  className = "",
}: SidebarRailProps) {
  const pathname = usePathname();
  const { resolvedTheme, toggleTheme } = useTheme();

  return (
    <aside
      className={`hidden lg:flex w-[260px] flex-col flex-none min-h-dvh border-r border-border-subtle bg-surface-1 px-4 py-5 select-none ${className}`}
    >
      {/* Header: Logo & Branding */}
      <div className="flex items-center gap-3 px-2 mb-6">
        <Image
          src="/logo.svg"
          alt="Meu Ted"
          width={36}
          height={36}
          className="h-9 w-9 flex-none"
        />
        <div className="flex flex-col">
          <span className="text-[15px] font-bold tracking-tight text-text-primary">
            Meu Ted
          </span>
          <span className="text-[10px] font-medium text-text-muted">
            tudo em dia.
          </span>
        </div>
      </div>

      {/* Workspace Switcher */}
      <div className="mb-5 px-1">
        <WorkspaceSwitcher compact />
      </div>

      {/* New Transaction CTA Button */}
      <div className="mb-6 px-1">
        <Button
          variant="primary"
          size="md"
          onClick={onNewTransaction}
          className="w-full justify-center shadow-fab"
          leftIcon={<Plus size={18} strokeWidth={2.4} />}
        >
          Novo lançamento
        </Button>
      </div>

      {/* Primary Navigation */}
      <div className="flex-1 overflow-y-auto pr-1 space-y-6">
        <div>
          <div className="px-3 mb-2 text-[10px] font-bold uppercase tracking-wider text-text-muted">
            Principal
          </div>
          <nav className="space-y-1">
            {PRIMARY_NAV.map((item) => {
              const isActive =
                item.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(item.href);
              const ItemIcon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={isActive ? "page" : undefined}
                  className={`flex items-center gap-3 rounded-[12px] px-3 py-2 text-[13px] font-semibold transition-all duration-150 ${
                    isActive
                      ? "bg-primary-tint text-primary font-bold shadow-xs"
                      : "text-text-secondary hover:text-text-primary hover:bg-surface-2"
                  }`}
                >
                  <ItemIcon
                    size={18}
                    strokeWidth={1.9}
                    className={isActive ? "text-primary" : "text-text-muted"}
                  />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        <div>
          <div className="px-3 mb-2 text-[10px] font-bold uppercase tracking-wider text-text-muted">
            Gestão & Ferramentas
          </div>
          <nav className="space-y-1">
            {SECONDARY_NAV.map((item) => {
              const isActive = pathname.startsWith(item.href);
              const ItemIcon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={isActive ? "page" : undefined}
                  className={`flex items-center gap-3 rounded-[12px] px-3 py-2 text-[13px] font-semibold transition-all duration-150 ${
                    isActive
                      ? "bg-primary-tint text-primary font-bold shadow-xs"
                      : "text-text-secondary hover:text-text-primary hover:bg-surface-2"
                  }`}
                >
                  <ItemIcon
                    size={18}
                    strokeWidth={1.9}
                    className={isActive ? "text-primary" : "text-text-muted"}
                  />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Footer: User Profile & Theme Toggle */}
      <div className="pt-4 mt-auto border-t border-border-subtle flex items-center justify-between px-2">
        <Link
          href="/perfil"
          className={`flex items-center gap-2.5 rounded-[12px] px-2 py-1.5 text-[13px] font-semibold transition-colors ${
            pathname === "/perfil"
              ? "text-primary font-bold"
              : "text-text-secondary hover:text-text-primary hover:bg-surface-2"
          }`}
        >
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-surface-2 text-text-secondary">
            <User size={15} strokeWidth={1.9} />
          </div>
          <span>Meu Perfil</span>
        </Link>

        <button
          type="button"
          onClick={toggleTheme}
          aria-label="Alternar tema"
          className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-2 text-text-muted transition-colors hover:text-text-primary focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
        >
          {resolvedTheme === "dark" ? (
            <Sun size={16} className="text-warning" />
          ) : (
            <Moon size={16} className="text-primary" />
          )}
        </button>
      </div>
    </aside>
  );
}

export default SidebarRail;
