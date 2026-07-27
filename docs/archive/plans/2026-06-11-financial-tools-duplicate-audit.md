# Phase 3a — Diagnostic Report: financial-tools duplicate pairs

**Date:** 2026-06-11
**Worktree:** `D:/projetos/pi-financeiro-worker1`
**Goal:** stabilize-pi-financeiro-2026-06-11
**Work key:** implement:audit-financial-tools-duplicates

---

## Finding: Not Duplicates — Layered Architecture

Each "duplicate" pair is actually a **two-layer design**:

| Pair | Hyphenated (core) | Underscore (tool wrapper) |
|------|-------------------|--------------------------|
| `accounts-payable.ts` / `accounts_payable.ts` | 270 lines — helpers only | 523 lines — imports hyphenated + wraps in ToolDefinition |
| `goals-budgets.ts` / `goals_budgets.ts` | 618 lines — helpers + types | 676 lines — imports hyphenated + wraps in ToolDefinition |
| `card-insights.ts` / `card_insights.ts` | 247 lines — helpers + types | 112 lines — imports hyphenated + wraps in ToolDefinition |

**Both files in each pair are active and necessary.**

---

## Dependency Chain

### `accounts-payable.ts` → `accounts_payable.ts`
- `accounts-payable.ts` exports: `getAccountsNeedingReminder`, `markReminderSent`, `computeEffectiveStatus`, `getNextDueDate`, `formatReminder`, `formatAccountsList`, `AccountPayableWithDetails`
- `accounts_payable.ts` imports from `./accounts-payable.js` and wraps those into Pi tools: `createAccountPayable`, `listAccountsPayable`, `markAccountPaid`, `cancelAccountPayable`, `checkPayableReminders`, `refreshPayableStatus`

### `goals-budgets.ts` → `goals_budgets.ts`
- `goals-budgets.ts` exports: `computeGoalProgress`, `computeBudgetStatus`, `getAllBudgetStatuses`, `getBudgetTrends`, `getBudgetAdjustmentSuggestion`, `refreshGoals`, `Goal`, `Budget`
- `goals_budgets.ts` imports from `./goals-budgets.js` and wraps into Pi tools: `createGoal`, `listGoals`, `contributeToGoal`, `cancelGoal`, `createBudget`, `listBudgets`, `checkBudgets`, `refreshGoalsTool`, `budgetTrendsTool`, `suggestBudgetAdjustmentTool`, `updateBudgetTool`

### `card-insights.ts` → `card_insights.ts`
- `card-insights.ts` exports: `getMonthOverMonthInsights`, `getTopCategoriesByCard`, `getCardVsOtherPayment`, `getTotalOverdue`, `formatInsights`, `formatTopCategories`, `CardInsight`, `CategoryInsight`
- `card_insights.ts` imports from `./card-insights` and wraps into Pi tool: `cardInsights`

---

## Who Imports What

| File | Imported by | Notes |
|------|-------------|-------|
| `accounts-payable.ts` | `accounts_payable.ts` | Internal helper |
| `accounts_payable.ts` | `index.ts` | Tool API — active |
| `goals-budgets.ts` | `goals_budgets.ts`, `test-goals-budgets.ts`, `test-evolutions.ts` | Internal helper + tests |
| `goals_budgets.ts` | `index.ts` | Tool API — active |
| `card-insights.ts` | `card_insights.ts` | Internal helper |
| `card_insights.ts` | `index.ts` | Tool API — active |

---

## Risk Assessment

### Removing hyphenated files
**RISK: HIGH — breaks internal imports in underscore files and test files.**

The underscore tool wrappers have `import { ... } from "./accounts-payable.js"` etc. Removing the hyphenated files would:
1. Break `accounts_payable.ts`, `goals_budgets.ts`, `card_insights.ts` at compile time
2. Break `test-evolutions.ts` and `test-goals-budgets.ts` which import helpers from hyphenated files

### Removing underscore files
**RISK: HIGH — `index.ts` imports only the underscore versions.**

If you remove `accounts_payable.ts`, `goals_budgets.ts`, `card_insights.ts`:
1. `index.ts` would fail to import (`Cannot find module './tools/accounts_payable.js'`)
2. All 5+11+1 = 17 Pi tools would be unregistered

### Renaming either layer
**RISK: HIGH — would require updating all imports in the other layer + index.ts + test files.**

---

## Pre-existing Issues Found

1. **Extension typecheck fails** due to missing node_modules: `@earendil-works/pi-coding-agent`, `@sinclair/typebox`, `pg`, `pi-coding-agent` not resolved. This is environment-level, not introduced by our work.
2. **`.bak` file**: `.pi/extensions/financial-tools/package.json.bak` — backup artifact, not tracked in git.
3. **`.pi/extensions/financial-tools/scripts/apply-ocr.ts`**: untracked script.
4. **`.pi/extensions/financial-tools/types/`**: empty/untracked directory.
5. **`accounts-payable.ts` line 76, 80**: `Property 'toISOString' does not exist on type 'never'` — pre-existing TypeScript error.
6. **`card-insights.ts` line 95**: `Type 'MapIterator<CardInsight>' can only be iterated through` — pre-existing downlevelIteration error.

---

## Recommendation for Next Sub-phase (3b)

**Do NOT remove or rename any of the 6 files.** The layered design is intentional.

If cleanup is desired, options (in order of safety):
1. **Rename the hyphenated files to `*-core.ts`** and update the internal imports — minimal surface, clearer intent
2. **Merge the helper into the tool wrapper** (inline the hyphenated into underscore) — reduces files but increases coupling
3. **Leave as-is** — both layers are actively used and the design is coherent

Any deletion or rename requires:
- Update internal imports in the paired file
- Update test file imports (`test-evolutions.ts`, `test-goals-budgets.ts`)
- Update `index.ts` if the underscore file is removed
- Verify with `pnpm test -- --run` and extension `pnpm typecheck`

---

## Verification

- `pnpm test -- --run` → **PASS** (377/377, exit 0)
- `pnpm typecheck` (whatsapp-bridge) → **PASS** (0 errors in bridge)
- Extension typecheck: **FAIL** (pre-existing missing node_modules — out of scope)

---

*Gerado por worker1 — Phase 3a — stabilize-pi-financeiro-2026-06-11*