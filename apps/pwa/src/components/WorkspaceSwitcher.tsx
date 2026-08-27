import { useWorkspaceSafe } from "@/lib/auth/workspace-context";
import { useState, useRef, useEffect } from "react";

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

  if (loading) {
    return (
      <div
        className={`flex items-center gap-1.5 rounded-full border border-border bg-bg-surface px-2.5 py-1 text-text-muted ${
          compact ? "text-xs max-w-[130px]" : "text-sm max-w-[160px]"
        }`}
      >
        <span className="truncate">Carregando…</span>
      </div>
    );
  }

  if (error && workspaces.length === 0) {
    return (
      <div
        className={`flex items-center gap-1.5 rounded-full border border-danger/30 bg-danger/10 px-2.5 py-1 text-danger ${
          compact ? "text-xs" : "text-sm"
        }`}
      >
        <span className="truncate">Offline</span>
      </div>
    );
  }

  const currentName = activeWorkspace?.name ?? (workspaces.length > 0 ? "Selecionar" : "Sem workspace");

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      <button
        type="button"
        aria-label="Selecionar workspace"
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((prev) => !prev)}
        className={`group flex items-center gap-1.5 rounded-full border border-border bg-bg-surface px-2.5 py-1 font-medium text-text-primary transition hover:border-text-secondary/40 hover:bg-fill-light focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
          compact ? "text-xs max-w-[140px] sm:max-w-[180px]" : "text-sm max-w-[180px] sm:max-w-[240px]"
        }`}
      >
        <span className="truncate">{currentName}</span>
        <svg
          className={`h-3 w-3 flex-shrink-0 text-text-muted transition-transform duration-200 ${
            open ? "rotate-180 text-text-primary" : ""
          }`}
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
          className="absolute right-0 z-50 mt-1.5 w-64 max-w-[calc(100vw-2rem)] origin-top-right rounded-xl border border-border bg-bg-surface p-1.5 shadow-xl ring-1 ring-black/5 focus:outline-none"
        >
          <div className="px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
            Workspaces
          </div>
          <div className="max-h-60 overflow-y-auto">
            {workspaces.map((w) => {
              const isSelected = w.id === activeWorkspace?.id;
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
                  className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition ${
                    isSelected
                      ? "bg-primary/10 font-semibold text-primary"
                      : "text-text-primary hover:bg-fill-light"
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate">{w.name}</div>
                    <div className="text-[10px] text-text-muted">
                      {w.kind === "personal" ? "Pessoal" : "Compartilhado"}
                    </div>
                  </div>
                  {isSelected && (
                    <svg className="h-4 w-4 flex-shrink-0 text-primary" viewBox="0 0 20 20" fill="currentColor">
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                  )}
                </button>
              );
            })}
            {workspaces.length === 0 && (
              <div className="px-2.5 py-3 text-center text-xs text-text-muted">
                Nenhum workspace encontrado.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
