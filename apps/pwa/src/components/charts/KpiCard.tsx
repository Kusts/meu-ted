"use client";

export type KpiTrend = "up" | "down" | "flat";

/**
 * Cartão de KPI genérico: valor, delta vs período anterior e sparkline
 * opcional (polyline inline, sem dependências).
 */
export function KpiCard({
  label,
  value,
  deltaText,
  trend = "flat",
  spark,
  hint,
}: {
  label: string;
  value: string;
  deltaText?: string | null;
  trend?: KpiTrend;
  spark?: number[];
  hint?: string;
}) {
  const trendColor =
    trend === "up" ? "text-primary" : trend === "down" ? "text-danger" : "text-text-muted";
  const sparkPoints = (() => {
    if (!spark || spark.length < 2) return null;
    const min = Math.min(...spark);
    const max = Math.max(...spark);
    const span = max - min || 1;
    return spark
      .map((value, i) => `${(i / (spark.length - 1)) * 100},${28 - ((value - min) / span) * 24}`)
      .join(" ");
  })();
  return (
    <div
      className="flex min-w-0 flex-col gap-1 rounded-[16px] border border-border-subtle bg-surface-1 p-3.5 shadow-card"
      role="group"
      aria-label={`${label}: ${value}${deltaText ? `, ${deltaText}` : ""}`}
    >
      <span className="truncate text-[11px] font-bold uppercase tracking-wider text-text-muted">{label}</span>
      <span className="truncate text-[20px] font-bold tabular-nums tracking-tight text-text-primary">{value}</span>
      <span className="flex items-center justify-between gap-2">
        <span className={`truncate text-[11px] font-bold ${trendColor}`}>
          {deltaText ?? "—"}
        </span>
        {sparkPoints && (
          <svg viewBox="0 0 100 32" className="h-6 w-16 flex-none" aria-hidden="true">
            <polyline
              points={sparkPoints}
              fill="none"
              stroke="var(--primary)"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </span>
      {hint && <span className="truncate text-[10px] font-medium text-text-muted">{hint}</span>}
    </div>
  );
}
