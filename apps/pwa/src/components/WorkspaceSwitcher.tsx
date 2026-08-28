import { useWorkspaceSafe } from "@/lib/auth/workspace-context";
import { useState, useRef, useEffect, useMemo } from "react";

function workspaceInitials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  if (parts.length === 1) return parts[0]!.charAt(0).toUpperCase();
  return (parts[0]!.charAt(0) + parts[1]!.charAt(0)).toUpperCase();
}

function workspaceColor(name: string, kind: string): string {
  if (kind === "personal") return "#0E8C5A";
  // Deterministic hue from name for shared workspaces
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  const hues = [152, 202, 262, 32, 12, 172];
  const hue = hues[hash % hues.length]!;
  return `hsl(${hue} 58% 38%)`;
}

export function WorkspaceSwitcher({ compact = false }: { compact?: boolean }) {
  const ws = useWorkspaceSafe();
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  if (!ws) return null;
  const { workspaces, activeWorkspace, selectWorkspace, loading, error } = ws;

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open]);

  const currentName = useMemo(() => activeWorkspace?.name ?? (workspaces.length > 0 ? "Selecionar workspace" : "Sem workspace"), [activeWorkspace, workspaces]);

  if (loading) {
    return (
      <div
        className={`flex items-center gap-2 rounded-full border border-border bg-white px-3 py-1.5 text-text-muted shadow-sm ${
          compact ? "text-xs max-w-[150px]" : "text-sm max-w-[200px]"
        }`}
      >
        <span className="h-6 w-6 animate-pulse rounded-full bg-fill-light" />
        <span className="truncate">Carregando…</span>
      </div>
    );
  }

  if (error && workspaces.length === 0) {
    return (
      <div
        className={`flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-amber-800 ${
          compact ? "text-xs" : "text-sm"
        }`}
      >
        <span className="h-2 w-2 rounded-full bg-amber-500" />
        <span className="truncate">Offline</span>
      </div>
    );
  }

  const activeColor = activeWorkspace ? workspaceColor(activeWorkspace.name, activeWorkspace.kind) : "#6B7280";

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      <button
        type="button"
        aria-label="Selecionar workspace"
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((prev) => !prev)}
        className={`group flex items-center gap-2.5 rounded-full border bg-white pl-1.5 pr-3 py-1.5 text-left shadow-sm transition-all hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 ${
          compact ? "text-xs max-w-[160px] sm:max-w-[200px]" : "text-sm max-w-[220px] sm:max-w-[280px]"
        } ${open ? "border-emerald-200 ring-1 ring-emerald-500/20 shadow-md" : "border-border"}`}
      >
        <span
          className="flex h-7 w-7 flex-none items-center justify-center rounded-full text-[11px] font-bold text-white shadow-sm ring-1 ring-black/5"
          style={{ background: activeColor }}
          aria-hidden="true"
        >
          {workspaceInitials(currentName)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold leading-none tracking-tight text-text-primary">{currentName}</span>
          <span className="block truncate text-[11px] font-medium leading-none text-text-muted">
            {activeWorkspace?.kind === "personal" ? "Pessoal" : activeWorkspace ? "Compartilhado" : "—"}
          </span>
        </span>
        <svg
          className={`h-3.5 w-3.5 flex-none text-text-muted transition-transform duration-200 ${open ? "rotate-180 text-text-primary" : "group-hover:text-text-primary"}`}
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute right-0 z-50 mt-2 w-[320px] max-w-[calc(100vw-1.5rem)] origin-top-right overflow-hidden rounded-2xl border border-border bg-white shadow-[0_12px_32px_rgba(0,0,0,0.14),0_2px_8px_rgba(0,0,0,0.08)] ring-1 ring-black/5"
        >
          <div className="bg-gradient-to-b from-emerald-50/60 to-white px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-emerald-800/70">Workspaces</div>
            <div className="text-[12px] text-text-muted">{workspaces.length} {workspaces.length === 1 ? "workspace disponível" : "workspaces disponíveis"}</div>
          </div>
          <div className="max-h-64 overflow-y-auto p-2">
            {workspaces.map((w) => {
              const isSelected = w.id === activeWorkspace?.id;
              const color = workspaceColor(w.name, w.kind);
              return (
                <button
                  key={w.id}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => {
                    void selectWorkspace(w.id);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${
                    isSelected ? "bg-emerald-50 ring-1 ring-emerald-200" : "hover:bg-fill-light"
                  }`}
                >
                  <span
                    className="flex h-9 w-9 flex-none items-center justify-center rounded-full text-xs font-bold text-white shadow-sm ring-1 ring-black/5"
                    style={{ background: color }}
                  >
                    {workspaceInitials(w.name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className={`truncate text-sm ${isSelected ? "font-semibold text-emerald-900" : "font-medium text-text-primary"}`}>{w.name}</div>
                    <div className="flex items-center gap-1.5">
                      <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${w.kind === "personal" ? "bg-slate-100 text-slate-700" : "bg-violet-50 text-violet-700 ring-1 ring-violet-200"}`}>
                        {w.kind === "personal" ? "Pessoal" : "Compartilhado"}
                      </span>
                      {isSelected && <span className="text-[11px] font-medium text-emerald-700">• Ativo</span>}
                    </div>
                  </div>
                  {isSelected && (
                    <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-emerald-600 text-white shadow-sm">
                      <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                        <path
                          fillRule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </span>
                  )}
                </button>
              );
            })}
            {workspaces.length === 0 && (
              <div className="px-3 py-8 text-center">
                <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-fill-light text-text-muted">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                    <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M23 21v-2a4 4 0 00-3-3.87" />
                    <path d="M16 3.13a4 4 0 010 7.75" />
                  </svg>
                </div>
                <div className="text-sm font-medium text-text-primary">Nenhum workspace</div>
                <div className="text-xs text-text-muted">Você ainda não participa de nenhum workspace.</div>
              </div>
            )}
          </div>
          <div className="border-t border-border bg-fill-light/50 px-3 py-2.5 text-[11px] text-text-muted">Trocar workspace limpa dados sensíveis locais e reconecta ao novo ambiente.</div>
        </div>
      )}
    </div>
  );
}
