"use client";

import { useId, useRef, useState } from "react";

export type SeriesPoint = { date: string; valueCents: number };

const WIDTH = 320;
const HEIGHT = 172;
const MARGIN = { top: 12, right: 10, bottom: 22, left: 48 };

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

/** "2026-09-03" -> "03/09". Devolve o original quando o formato é inesperado. */
export const formatDayMonth = (isoDate: string): string => {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
  if (!match) return isoDate;
  return `${match[3]}/${match[2]}`;
};

/** Tick monetário compacto em pt-BR: "R$ 1,2k", "R$ 3M", "R$ 50". */
export const formatCompactTick = (cents: number): string => {
  const value = cents / 100;
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  const trim1 = (n: number): string => String(parseFloat(n.toFixed(1))).replace(".", ",");
  if (abs >= 1_000_000) return `${sign}R$ ${trim1(abs / 1_000_000)}M`;
  if (abs >= 1000) return `${sign}R$ ${trim1(abs / 1000)}k`;
  if (Number.isInteger(abs)) return `${sign}R$ ${abs}`;
  return `${sign}R$ ${abs.toFixed(2).replace(".", ",")}`;
};

/** Ticks "bonitos" (1/2/2.5/5 × 10^n) cobrindo [min, max]. */
export const niceTicks = (min: number, max: number, count = 4): number[] => {
  if (!Number.isFinite(min) || !Number.isFinite(max) || !(max > min)) return [min];
  const raw = (max - min) / count;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / magnitude;
  const step = (norm >= 5 ? 5 : norm >= 2.5 ? 2.5 : norm >= 2 ? 2 : 1) * magnitude;
  const start = Math.ceil(min / step) * step;
  const ticks: number[] = [];
  for (let i = 0; i < 64; i += 1) {
    const tick = parseFloat((start + i * step).toFixed(10));
    if (tick > max + 1e-9) break;
    ticks.push(tick);
  }
  if (ticks.length === 0) return [parseFloat(min.toFixed(10)), parseFloat(max.toFixed(10))];
  return ticks;
};

export type CashflowAreaChartProps = {
  current: SeriesPoint[];
  previous: SeriesPoint[];
  formatValue: (cents: number) => string;
  /** Saldo disponível vindo dos KPIs; quando ausente, usa o último ponto acumulado. */
  availableBalanceCents?: number | null;
  /** Delta vs período anterior vindo dos KPIs; quando ausente, é calculado da série. */
  deltaCents?: number | null;
  summaryLabel?: string;
  /** Formatação dos ticks do eixo Y; padrão é compacto pt-BR. */
  formatTick?: (cents: number) => string;
};

/**
 * Fluxo de caixa acumulado em SVG próprio: resumo de cabeçalho com delta vs
 * período anterior, legenda explícita, eixos X/Y legíveis, linha zero
 * discreta, tooltip por toque/teclado e escala estável.
 *
 * Acessibilidade: o SVG é a alternativa textual estática (role="img"); os
 * pontos interativos são <button> reais num overlay HTML irmão do SVG — nunca
 * role="button" dentro do role="img" — com hit area física de 44px.
 */
export function CashflowAreaChart({
  current,
  previous,
  formatValue,
  availableBalanceCents,
  deltaCents,
  summaryLabel = "Saldo acumulado",
  formatTick = formatCompactTick,
}: CashflowAreaChartProps) {
  // useId() evita colisão do gradiente quando há 2+ gráficos na página.
  const gradientId = `cashflow-${useId().replace(/[^a-zA-Z0-9-_]/g, "")}`;
  // Escopo do container: a navegação por setas nunca vaza para outra instância.
  const figureRef = useRef<HTMLElement | null>(null);
  const [selected, setSelected] = useState<number | null>(null);

  const values = [...current.map((p) => p.valueCents), ...previous.map((p) => p.valueCents)];
  let domainMin = 0;
  let domainMax = 0;
  if (values.length > 0) {
    const min = Math.min(...values);
    const max = Math.max(...values);
    if (min === max) {
      // Escala estável para série zerada ou constante: abre o domínio.
      const pad = Math.max(Math.abs(max) * 0.15, 100);
      domainMin = min - pad;
      domainMax = max + pad;
    } else {
      const pad = (max - min) * 0.12;
      domainMin = min - pad;
      domainMax = max + pad;
    }
  } else {
    domainMin = -1;
    domainMax = 1;
  }
  const span = domainMax - domainMin || 1;

  const plotLeft = MARGIN.left;
  const plotRight = WIDTH - MARGIN.right;
  const plotTop = MARGIN.top;
  const plotBottom = HEIGHT - MARGIN.bottom;
  const plotWidth = plotRight - plotLeft;
  const plotHeight = plotBottom - plotTop;

  const project = (points: SeriesPoint[]): { x: number; y: number }[] => {
    const n = points.length;
    return points.map((point, i) => ({
      // Poucos pontos (1-2): o ponto único fica centralizado, sem NaN.
      x: n <= 1 ? plotLeft + plotWidth / 2 : plotLeft + (i / (n - 1)) * plotWidth,
      y: plotTop + (1 - (point.valueCents - domainMin) / span) * plotHeight,
    }));
  };

  const currentCoords = project(current);
  const previousCoords = project(previous);
  const currentPath = smoothPath(currentCoords);
  const previousPath = smoothPath(previousCoords);
  const areaPath =
    currentPath === "" ? "" : `${currentPath} L ${plotRight} ${plotBottom} L ${plotLeft} ${plotBottom} Z`;

  const yTicks = niceTicks(domainMin, domainMax, 4);
  const tickY = (tick: number): number =>
    plotTop + (1 - (tick - domainMin) / span) * plotHeight;
  const crossesZero = domainMin < 0 && domainMax > 0;
  const zeroY = plotTop + (1 - (0 - domainMin) / span) * plotHeight;

  const xTickIndexes = (() => {
    const n = current.length;
    if (n === 0) return [];
    if (n === 1) return [0];
    return Array.from(new Set([0, Math.floor((n - 1) / 2), n - 1]));
  })();

  const lastCurrent = current[current.length - 1]?.valueCents;
  const firstCurrent = current[0]?.valueCents;
  const lastPrevious = previous[previous.length - 1]?.valueCents;
  const summaryValue = availableBalanceCents ?? lastCurrent ?? 0;
  const deltaValue =
    deltaCents ??
    (lastCurrent !== undefined && lastPrevious !== undefined
      ? lastCurrent - lastPrevious
      : lastCurrent !== undefined && firstCurrent !== undefined
        ? lastCurrent - firstCurrent
        : 0);
  const deltaColor =
    deltaValue > 0 ? "text-primary" : deltaValue < 0 ? "text-danger" : "text-text-muted";

  const summary =
    current.length === 0
      ? "Fluxo de caixa sem dados no período"
      : `Fluxo acumulado de ${formatValue(firstCurrent ?? 0)} para ${formatValue(lastCurrent ?? 0)} em ${current.length} dias`;

  const selectPoint = (index: number | null): void => setSelected(index);
  const focusPoint = (index: number): void => {
    selectPoint(index);
    // Move o foco junto na navegação por setas, escopado a esta instância.
    const el = figureRef.current?.querySelector<HTMLElement>(
      `[data-testid="cashflow-point-${index}"]`,
    );
    el?.focus();
  };

  const selectedPoint = selected !== null ? current[selected] : undefined;
  const selectedCoord = selected !== null ? currentCoords[selected] : undefined;

  return (
    <figure ref={figureRef} data-testid="cashflow-chart" data-no-swipe="true" className="w-full">
      {current.length > 0 && (
        <div className="mb-2 flex items-end justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[11px] font-bold tracking-wider text-text-muted uppercase">
              {summaryLabel}
            </p>
            <p
              data-testid="cashflow-summary-value"
              className="font-mono text-[20px] font-bold tracking-tight text-text-primary tabular-nums"
            >
              {formatValue(summaryValue)}
            </p>
          </div>
          <p
            data-testid="cashflow-summary-delta"
            className={`shrink-0 font-mono text-[12px] font-bold tabular-nums ${deltaColor}`}
          >
            {deltaValue > 0 ? "+" : ""}
            {formatValue(deltaValue)}{" "}
            <span className="font-sans font-semibold text-text-muted">vs período anterior</span>
          </p>
        </div>
      )}

      <div
        className="relative"
        style={{ touchAction: "pan-y" }}
        onMouseLeave={() => selectPoint(null)}
      >
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="h-auto w-full"
          role="img"
          aria-label={`${summary}. Linha sólida: este período. Linha tracejada: período anterior.`}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.45} />
              <stop offset="100%" stopColor="var(--primary)" stopOpacity={0.04} />
            </linearGradient>
          </defs>

          <g data-testid="cashflow-y-axis" aria-hidden="true">
            {yTicks.map((tick, i) => (
              <g key={tick}>
                <line
                  x1={plotLeft}
                  x2={plotRight}
                  y1={tickY(tick)}
                  y2={tickY(tick)}
                  stroke="var(--border-subtle)"
                  strokeOpacity={0.6}
                  strokeWidth={1}
                />
                <text
                  data-testid={`cashflow-y-tick-${i}`}
                  x={plotLeft - 6}
                  y={tickY(tick) + 3}
                  textAnchor="end"
                  fontSize={9}
                  fill="var(--text-muted)"
                >
                  {formatTick(tick)}
                </text>
              </g>
            ))}
          </g>

          {crossesZero && (
            <line
              data-testid="cashflow-zero-line"
              x1={plotLeft}
              x2={plotRight}
              y1={zeroY}
              y2={zeroY}
              stroke="var(--text-muted)"
              strokeOpacity={0.5}
              strokeWidth={1}
              strokeDasharray="2 3"
            />
          )}

          <g data-testid="cashflow-x-axis" aria-hidden="true">
            {xTickIndexes.map((pointIndex) => {
              const coord = currentCoords[pointIndex];
              const point = current[pointIndex];
              if (!coord || !point) return null;
              return (
                <text
                  key={pointIndex}
                  x={coord.x}
                  y={HEIGHT - 6}
                  textAnchor="middle"
                  fontSize={9}
                  fill="var(--text-muted)"
                >
                  {formatDayMonth(point.date)}
                </text>
              );
            })}
          </g>

          {areaPath !== "" && (
            <path
              d={areaPath}
              fill={`url(#${gradientId})`}
              className="transition-all duration-300 motion-reduce:transition-none"
            />
          )}
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
            <path
              d={currentPath}
              fill="none"
              stroke="var(--primary)"
              strokeWidth={2.5}
              strokeLinecap="round"
              className="transition-all duration-300 motion-reduce:transition-none"
            />
          )}

          {selectedCoord && (
            <line
              data-testid="cashflow-crosshair"
              x1={selectedCoord.x}
              x2={selectedCoord.x}
              y1={plotTop}
              y2={plotBottom}
              stroke="var(--primary)"
              strokeOpacity={0.35}
              strokeWidth={1}
              strokeDasharray="3 3"
            />
          )}

          {current.map((point, i) => {
            const coord = currentCoords[i];
            if (!coord) return null;
            const isSelected = selected === i;
            const isLast = i === current.length - 1;
            if (!isSelected && !(isLast && selected === null)) return null;
            return (
              <circle
                key={`${point.date}-${i}`}
                cx={coord.x}
                cy={coord.y}
                r={isSelected ? 4 : 3}
                fill="var(--primary)"
                stroke="var(--surface-1)"
                strokeWidth={1.5}
                aria-hidden="true"
              />
            );
          })}
        </svg>

        <div
          role="group"
          aria-label="Pontos do fluxo de caixa acumulado. Use Tab para navegar e Enter para ver o valor."
          className="absolute inset-0"
        >
          {current.map((point, i) => {
            const coord = currentCoords[i];
            if (!coord) return null;
            return (
              <button
                key={`${point.date}-${i}`}
                type="button"
                data-testid={`cashflow-point-${i}`}
                aria-label={`${formatDayMonth(point.date)}: ${formatValue(point.valueCents)}`}
                aria-pressed={selected === i}
                className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full bg-transparent focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
                style={{
                  left: `${(coord.x / WIDTH) * 100}%`,
                  top: `${(coord.y / HEIGHT) * 100}%`,
                  // Hit area física de 44px para toque/pointer (WCAG 2.5.8 pede ≥24px).
                  width: 44,
                  height: 44,
                  cursor: "pointer",
                  touchAction: "pan-y",
                }}
                onFocus={() => selectPoint(i)}
                onMouseEnter={() => selectPoint(i)}
                onTouchStart={() => selectPoint(i)}
                // Enter/Espaço disparam click nativo no <button> e selecionam o ponto.
                onClick={() => selectPoint(i)}
                onKeyDown={(event) => {
                  if (event.key === "ArrowRight" || event.key === "ArrowDown") {
                    event.preventDefault();
                    focusPoint(Math.min(i + 1, current.length - 1));
                  } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
                    event.preventDefault();
                    focusPoint(Math.max(i - 1, 0));
                  } else if (event.key === "Escape") {
                    selectPoint(null);
                  }
                }}
              />
            );
          })}
        </div>

        {selectedPoint && selectedCoord && (
          <div
            data-testid="cashflow-tooltip"
            role="status"
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-[10px] border border-border-subtle bg-surface-1 px-2.5 py-1.5 text-center shadow-elevated"
            style={{
              left: `${Math.min(Math.max((selectedCoord.x / WIDTH) * 100, 16), 84)}%`,
              top: `${(selectedCoord.y / HEIGHT) * 100}%`,
            }}
          >
            <p className="text-[10px] font-bold whitespace-nowrap text-text-muted">
              {formatDayMonth(selectedPoint.date)}
            </p>
            <p className="font-mono text-[12px] font-bold whitespace-nowrap text-text-primary tabular-nums">
              {formatValue(selectedPoint.valueCents)}
            </p>
          </div>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5">
        <span
          data-testid="cashflow-legend-current"
          className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-text-secondary"
        >
          <span
            aria-hidden="true"
            className="inline-block h-[3px] w-6 rounded-full"
            style={{ background: "var(--primary)" }}
          />
          Este período
        </span>
        <span
          data-testid="cashflow-legend-previous"
          className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-text-secondary"
        >
          <span
            aria-hidden="true"
            className="inline-block h-0 w-6 border-t-2 border-dashed"
            style={{ borderColor: "var(--text-muted)" }}
          />
          Período anterior
        </span>
      </div>

      <figcaption className="sr-only">
        {current.map((point) => `${point.date}: ${formatValue(point.valueCents)}`).join("; ")}
      </figcaption>
    </figure>
  );
}
