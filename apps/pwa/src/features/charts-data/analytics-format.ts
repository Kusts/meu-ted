"use client";

import type { KpiTrend } from "@/components/charts";

/**
 * Deltas "vs período anterior" para os KpiCards (números tabulares,
 * convenção de ponto decimal do formatPct).
 */
export const pctChange = (current: number, previous: number): number | null => {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
};

const signed = (value: number, suffix: string): string =>
  `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value).toFixed(1)}${suffix} vs período anterior`;

export const formatDeltaPct = (delta: number | null): string | null =>
  delta === null ? null : signed(delta, "%");

export const formatDeltaPp = (delta: number | null): string | null =>
  delta === null ? null : signed(delta, " p.p.");

export const trendOf = (delta: number | null, invert = false): KpiTrend => {
  if (delta === null || delta === 0) return "flat";
  const up = delta > 0;
  return (up && !invert) || (!up && invert) ? "up" : "down";
};
