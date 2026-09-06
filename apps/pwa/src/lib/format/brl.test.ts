import { describe, it, expect } from "vitest";
import { formatBRL, formatPct } from "./brl";

describe("lib/format/brl", () => {
  // pt-BR Intl separa o símbolo com non-breaking space; normaliza p/ comparar.
  const norm = (s: string) => s.replaceAll(String.fromCharCode(160), " ");

  it("formats cents as pt-BR currency", () => {
    expect(norm(formatBRL(1234500))).toBe("R$ 12.345,00");
    expect(norm(formatBRL(0))).toBe("R$ 0,00");
    expect(norm(formatBRL(-550))).toBe("-R$ 5,50");
  });

  it("formats ratios with one decimal + %", () => {
    expect(formatPct(20)).toBe("20.0%");
    expect(formatPct(4.256)).toBe("4.3%");
  });
});
