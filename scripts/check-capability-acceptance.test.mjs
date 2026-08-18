import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateCapabilityAcceptance, parseCapabilityInventory } from "./check-capability-acceptance.mjs";

test("capability acceptance checker", async (t) => {
  await t.test("parses markdown table correctly", () => {
    const fixture = `
| CAP-001 | \`list_accounts\` | List active accounts and balances | member | daily | low | \`GET /accounts\` | Accounts, Wallet | UI | covered | query | GET | /accounts | — | accounts-list | — | none | api |
| CAP-010 | \`create_expense\` | Register an expense transaction | member | daily | high | \`POST /transactions/expense\` | Records | UI | covered | command | POST | /transactions/expense | — | transactions-expense-create | — | policy | api |
    `;
    const rows = parseCapabilityInventory(fixture);
    assert.equal(rows.length, 2);
    assert.equal(rows[0]?.id, "CAP-001");
    assert.equal(rows[0]?.tool, "list_accounts");
    assert.equal(rows[1]?.id, "CAP-010");
  });

  await t.test("evaluates real repository capability inventory without missing evidence", () => {
    const assessment = evaluateCapabilityAcceptance();
    assert.ok(assessment.total > 0, "Inventory must contain capabilities");
    assert.ok(assessment.apiModeCount > 0, "Must contain API mode capabilities");
    assert.equal(assessment.allValid, true, "All capabilities must have valid evidence");
  });
});
