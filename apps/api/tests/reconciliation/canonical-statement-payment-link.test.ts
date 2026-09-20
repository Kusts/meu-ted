import { describe, expect, it } from "vitest";
import { buildReconciliationQueries } from "../../src/scripts/reconciliation/sql.js";
import { createInMemoryCardStore } from "../../src/cards/in-memory.js";
import type { InMemoryState } from "../../src/writes/in-memory.js";

/**
 * debt-canonical-coverage-structured-link (final review MEDIUM):
 * canonical reconciliation must not accept any manual transaction merely
 * because free-text description equals `Pagamento fatura {cycle}`.
 * Canonical payStatement owns a structured origin (transactions.
 * statement_payment_id → statements.id, V056); canonical coverage must join
 * on it. Legacy keeps description matching untouched.
 */
describe("canonical statement payment structured link (V056)", () => {
  it("canonical coverage joins on statement_payment_id, never on description", () => {
    const queries = buildReconciliationQueries("canonical", {});
    const text = queries.statement_payment_coverage.text;
    expect(text).toMatch(/statement_payment_id/);
    // No description-only selector may remain on the canonical path:
    // a manual expense sharing the display text must not count.
    expect(text).not.toMatch(/Pagamento fatura/);
    expect(text).not.toMatch(/t\.description\s*=/);
  });

  it("legacy coverage keeps description matching (semantics unchanged)", () => {
    const queries = buildReconciliationQueries("legacy", {});
    const text = queries.statement_payment_coverage.text;
    expect(text).toMatch(/Pagamento fatura/);
  });

  it("genuine canonical payStatement output carries the structured link", async () => {
    const householdId = "h-link-genuine";
    const payer = {
      id: "payer-1",
      householdId,
      name: "Bank",
      kind: "bank" as const,
      balanceCents: 100_000,
      status: "active" as const,
    };
    const card = {
      id: "card-1",
      householdId,
      name: "Card",
      kind: "credit_card" as const,
      balanceCents: 0,
      status: "active" as const,
      creditLimitCents: 500_000,
      closingDay: 15,
      dueDay: 25,
    };
    const state: InMemoryState = {
      accounts: [payer, card],
      categories: [],
      transactions: [],
      deletedTransactions: new Set<string>(),
    };
    const cards = createInMemoryCardStore(state);
    // Seed one purchase so the statement has a total to pay.
    await cards.createCardPurchase(householdId, {
      accountId: card.id,
      description: "Store",
      amountCents: 3000,
      date: "2026-08-10",
    });
    const statements = await cards.listStatements(householdId, card.id);
    const stmt = statements[0]!;
    await cards.payStatement(householdId, stmt.id, {
      amountCents: 3000,
      fromAccountId: payer.id,
    });
    const paymentTx = state.transactions[state.transactions.length - 1]!;
    // Structured origin required for canonical coverage.
    const link =
      (paymentTx as unknown as Record<string, unknown>)["statementPaymentId"] ??
      (paymentTx as unknown as Record<string, unknown>)["statement_payment_id"];
    expect(link).toBe(stmt.id);
    // Display text stays for back-compat but is NOT the coverage key.
    expect(paymentTx.description).toBe(`Pagamento fatura ${stmt.cycleYearMonth}`);
  });

  it("manual expense with same description/value carries no structured link", async () => {
    const householdId = "h-link-manual";
    const payer = {
      id: "payer-1",
      householdId,
      name: "Bank",
      kind: "bank" as const,
      balanceCents: 100_000,
      status: "active" as const,
    };
    const state: InMemoryState = {
      accounts: [payer],
      categories: [],
      transactions: [
        {
          id: "manual-1",
          householdId,
          kind: "expense",
          description: "Pagamento fatura 2026-08",
          amountCents: 3000,
          date: "2026-08-20",
          accountId: payer.id,
        },
      ],
      deletedTransactions: new Set<string>(),
    };
    const manual = state.transactions[0]!;
    const link =
      (manual as unknown as Record<string, unknown>)["statementPaymentId"] ??
      (manual as unknown as Record<string, unknown>)["statement_payment_id"];
    expect(link).toBeUndefined();
    // Same display text, but without the structured origin it must not
    // satisfy canonical statement_payment_coverage.
    expect(manual.description).toBe("Pagamento fatura 2026-08");
  });
});
