"use client";

export type BulletItem = {
  id: string;
  name: string;
  spentCents: number;
  amountCents: number;
  pctUsed: number;
};

const MINT = "#66C2A3";
const OVER = "#F87171";

/**
 * Bullet bars de orçamento: barra fina com preenchimento até o uso e
 * marcador de meta nos 100%. Acima de 100% a barra fica vermelho suave.
 */
export function BudgetBulletBars({
  items,
  formatValue,
}: {
  items: BulletItem[];
  formatValue: (cents: number) => string;
}) {
  if (items.length === 0) {
    return <p className="py-4 text-center text-[12px] font-medium text-text-muted">Nenhum orçamento no período.</p>;
  }
  return (
    <ul className="flex flex-col gap-3" aria-label={`Consumo de ${items.length} orçamentos`}>
      {items.map((item) => {
        const over = item.pctUsed > 100;
        const fillPct = Math.min(100, Math.max(0, item.pctUsed));
        return (
          <li key={item.id}>
            <div className="mb-1 flex items-baseline justify-between gap-2">
              <span className="min-w-0 truncate text-[13px] font-bold text-text-primary">{item.name}</span>
              <span
                className="flex-none text-[12px] font-bold tabular-nums"
                style={{ color: over ? OVER : undefined }}
                aria-label={`${item.name}: ${formatValue(item.spentCents)} de ${formatValue(item.amountCents)}, ${item.pctUsed}% usado${over ? ", acima do teto" : ""}`}
              >
                <span className={over ? "" : "text-text-secondary"}>{item.pctUsed}%</span>
              </span>
            </div>
            <div
              className="relative h-[6px] overflow-visible rounded-full bg-surface-2"
              role="img"
              aria-label={`${item.name} ${item.pctUsed}% do teto`}
            >
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{ width: `${fillPct}%`, background: over ? OVER : MINT }}
              />
              <span
                className="absolute top-1/2 h-[10px] w-[2px] -translate-y-1/2 rounded-full bg-text-muted"
                style={{ left: "100%" }}
                aria-hidden="true"
              />
            </div>
            <span className="sr-only">
              {`${formatValue(item.spentCents)} de ${formatValue(item.amountCents)}`}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
