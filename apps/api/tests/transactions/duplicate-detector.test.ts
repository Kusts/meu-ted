import { describe, it, expect } from "vitest";
import { normalize, jaccardSimilarity, findDuplicate } from "../../src/transactions/duplicate-detector.js";

describe("duplicate-detector", () => {
  it("normalizes text removing accents and stopwords", () => {
    expect(normalize("Compra no Supermercado São Paulo")).toBe("compra supermercado sao paulo");
    expect(normalize("Pagamento de conta de luz")).toBe("pagamento conta luz");
  });

  it("computes jaccard similarity", () => {
    expect(jaccardSimilarity("mercado sao paulo", "mercado sao paulo")).toBe(1);
    expect(jaccardSimilarity("mercado sao paulo", "mercado rio")).toBeCloseTo(0.25, 1);
    expect(jaccardSimilarity("", "qualquer")).toBe(0);
  });

  it("finds duplicate via idempotency key", async () => {
    const pool: any = {
      query: async (sql: string, params: any[]) => {
        if (sql.includes("idempotency_key")) {
          return { rows: [{ id: "existing-1", amount_cents: "1000", description: "old", date: new Date("2026-08-20"), from_account_id: null, to_account_id: null, created_at: new Date() }] };
        }
        return { rows: [] };
      },
    };
    const match = await findDuplicate(pool, {
      householdId: "h1",
      kind: "expense",
      description: "nova compra",
      amountCents: 1000,
      date: "2026-08-20",
      idempotencyKey: "key-123",
    });
    expect(match).not.toBeNull();
    expect(match?.match_type).toBe("idempotency_key");
    expect(match?.similarity).toBe(1);
  });

  it("finds semantic duplicate with similarity >=0.6", async () => {
    const pool: any = {
      query: async () => ({
        rows: [
          { id: "1", amount_cents: "5000", description: "Supermercado Sao Paulo", date: new Date("2026-08-20"), from_account_id: null, to_account_id: null, created_at: new Date() },
          { id: "2", amount_cents: "5000", description: "Posto de gasolina", date: new Date("2026-08-20"), from_account_id: null, to_account_id: null, created_at: new Date() },
        ],
      }),
    };
    const match = await findDuplicate(pool, {
      householdId: "h1",
      kind: "expense",
      description: "compra supermercado sao paulo",
      amountCents: 5000,
      date: "2026-08-20",
    });
    expect(match?.id).toBe("1");
    expect(match?.similarity).toBeGreaterThanOrEqual(0.6);
  });

  it("returns null when no semantic match", async () => {
    const pool: any = { query: async () => ({ rows: [] }) };
    const match = await findDuplicate(pool, {
      householdId: "h1",
      kind: "expense",
      description: "compra totalmente diferente xyz",
      amountCents: 9999,
      date: "2026-08-20",
    });
    expect(match).toBeNull();
  });
});
