"use client";

export type SeriesPoint = { date: string; valueCents: number };

const WIDTH = 320;
const HEIGHT = 128;
const PAD = 8;

/** Catmull-Rom suavizada em path cúbico. */
const smoothPath = (points: { x: number; y: number }[]): string => {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0]!.x} ${points[0]!.y}`;
  let path = `M ${points[0]!.x} ${points[0]!.y}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[Math.max(0, i - 1)]!;
    const p1 = points[i]!;
    const p2 = points[i + 1]!;
    const p3 = points[Math.min(points.length - 1, i + 2)]!;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    path += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;
  }
  return path;
};

/**
 * Fluxo de caixa acumulado em SVG próprio: linha suavizada do período atual
 * com gradiente esmeralda + linha tracejada do período anterior.
 */
export function CashflowAreaChart({
  current,
  previous,
  formatValue,
}: {
  current: SeriesPoint[];
  previous: SeriesPoint[];
  formatValue: (cents: number) => string;
}) {
  const all = [...current.map((p) => p.valueCents), ...previous.map((p) => p.valueCents)];
  const min = all.length > 0 ? Math.min(...all) : 0;
  const max = all.length > 0 ? Math.max(...all) : 0;
  const span = max - min || 1;
  const project = (points: SeriesPoint[]): { x: number; y: number }[] => {
    const n = Math.max(points.length - 1, 1);
    return points.map((point, i) => ({
      x: PAD + (i / n) * (WIDTH - PAD * 2),
      y: PAD + (1 - (point.valueCents - min) / span) * (HEIGHT - PAD * 2),
    }));
  };
  const currentPath = smoothPath(project(current));
  const previousPath = smoothPath(project(previous));
  const areaPath =
    currentPath === "" ? "" : `${currentPath} L ${WIDTH - PAD} ${HEIGHT - PAD} L ${PAD} ${HEIGHT - PAD} Z`;
  const last = current[current.length - 1]?.valueCents ?? 0;
  const first = current[0]?.valueCents ?? 0;
  const gid = "cashflow-esmeralda";
  const summary =
    current.length === 0
      ? "Fluxo de caixa sem dados no período"
      : `Fluxo acumulado de ${formatValue(first)} para ${formatValue(last)} em ${current.length} dias`;

  return (
    <figure className="w-full">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="h-auto w-full"
        role="img"
        aria-label={`${summary}. Linha tracejada mostra o período anterior.`}
      >
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.45} />
            <stop offset="100%" stopColor="var(--primary)" stopOpacity={0.04} />
          </linearGradient>
        </defs>
        {areaPath !== "" && <path d={areaPath} fill={`url(#${gid})`} className="transition-all duration-300" />}
        {previousPath !== "" && (
          <path
            d={previousPath}
            fill="none"
            stroke="var(--text-muted)"
            strokeOpacity={0.55}
            strokeWidth={1.5}
            strokeDasharray="4 3"
          />
        )}
        {currentPath !== "" && (
          <path d={currentPath} fill="none" stroke="var(--primary)" strokeWidth={2.5} strokeLinecap="round" className="transition-all duration-300" />
        )}
      </svg>
      <figcaption className="sr-only">
        {current.map((point) => `${point.date}: ${formatValue(point.valueCents)}`).join("; ")}
      </figcaption>
    </figure>
  );
}
