import { describe, expect, it } from "vitest";
import { BANK_PRESETS, getBankPreset, getBankPresetByColor, getBankPresetByName } from "./bank-presets";

describe("bank-presets (TDD RED -> GREEN)", () => {
  it("exports at least 10 presets covering required banks", () => {
    const names = BANK_PRESETS.map((p) => p.name.toLowerCase());
    expect(BANK_PRESETS.length).toBeGreaterThanOrEqual(10);
    expect(names.some((n) => n.includes("nubank"))).toBe(true);
    expect(names.some((n) => n.includes("inter"))).toBe(true);
    expect(names.some((n) => n.includes("itaú") || n.includes("itau"))).toBe(true);
    expect(names.some((n) => n.includes("bradesco"))).toBe(true);
    expect(names.some((n) => n.includes("santander"))).toBe(true);
    expect(names.some((n) => n.includes("brasil") || n.includes("bb"))).toBe(true);
    expect(names.some((n) => n.includes("c6"))).toBe(true);
    expect(names.some((n) => n.includes("caixa"))).toBe(true);
    expect(names.some((n) => n.includes("picpay"))).toBe(true);
    expect(names.some((n) => n.includes("xp"))).toBe(true);
  });

  it("each preset has realistic visual fields", () => {
    for (const p of BANK_PRESETS) {
      expect(p.id).toMatch(/^[a-z0-9-]+$/);
      expect(p.name).toBeTruthy();
      expect(p.primaryColor).toMatch(/^#([0-9A-Fa-f]{6})$/);
      expect(p.gradient).toMatch(/linear-gradient|radial-gradient/);
      expect(p.cardGradient).toMatch(/linear-gradient|radial-gradient/);
      expect(typeof p.textColor).toBe("string");
      expect(["visa", "mastercard", "elo", "amex", "hipercard"]).toContain(p.network);
    }
  });

  it("provides variants for Itaú Personnalité and Bradesco Prime", () => {
    const hasPersonnalite = BANK_PRESETS.some((p) => p.id.includes("personnalite") || p.name.toLowerCase().includes("personnalité") || p.name.toLowerCase().includes("personnalite"));
    const hasPrime = BANK_PRESETS.some((p) => p.id.includes("prime") || p.name.toLowerCase().includes("prime"));
    expect(hasPersonnalite).toBe(true);
    expect(hasPrime).toBe(true);
  });

  it("resolves preset by color and by name", () => {
    const nubankByColor = getBankPresetByColor("#820AD1");
    expect(nubankByColor?.id).toMatch(/nubank/);

    const interByName = getBankPresetByName("Inter");
    expect(interByName?.id).toMatch(/inter/);

    const byId = getBankPreset("xp");
    expect(byId?.name.toLowerCase()).toContain("xp");
  });

  it("presets have distinct gradients (no duplicate primary colors for main banks)", () => {
    const mainIds = ["nubank", "inter", "itau", "bradesco", "santander", "bb", "c6", "caixa", "picpay", "xp"];
    const mains = BANK_PRESETS.filter((p) => mainIds.includes(p.id));
    const colors = mains.map((p) => p.primaryColor.toLowerCase());
    expect(new Set(colors).size).toBe(colors.length);
  });
});
