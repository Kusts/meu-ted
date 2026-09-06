/**
 * Formatação monetária BRL / percentuais em centavos (T1).
 * Fonte única — páginas que redefiniam `formatBRL`/`formatPct` localmente
 * devem importar daqui (migração gradual; ver docs/design/design-plan-v2-mobile.md).
 */
export function formatBRL(cents: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

export function formatPct(value: number): string {
  return `${value.toFixed(1)}%`;
}
