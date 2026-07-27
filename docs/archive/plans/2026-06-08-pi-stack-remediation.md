# Pi Stack Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove confirmed dead runtime duplication, put the active reminder runtime path under explicit checks, and reduce low-risk typing debt without changing the runtime/extension architecture.

**Architecture:** Keep two layers: standalone runtime functions for scripts/reminder and Pi ToolDefinition exports for the agent extension. Apply only low-risk cleanup backed by evidence from the completed review.

**Tech Stack:** TypeScript, Vitest, pg, pnpm workspaces, Pi extension tools

**Agent Orchestration:** Supervisor-Workers — planner defines waves, coder implements and validates sequentially.

---

### Task 1: Remove confirmed dead runtime CRUD duplicates

**Files:**
- Modify/Delete: `apps/whatsapp-bridge/src/tools/runtime/create_account.ts`
- Modify/Delete: `apps/whatsapp-bridge/src/tools/runtime/create_category.ts`
- Modify/Delete: `apps/whatsapp-bridge/src/tools/runtime/create_expense.ts`
- Modify/Delete: `apps/whatsapp-bridge/src/tools/runtime/create_income.ts`
- Modify/Delete: `apps/whatsapp-bridge/src/tools/runtime/create_transfer.ts`
- Modify/Delete: `apps/whatsapp-bridge/src/tools/runtime/deactivate_account.ts`
- Modify/Delete: `apps/whatsapp-bridge/src/tools/runtime/deactivate_category.ts`
- Modify/Delete: `apps/whatsapp-bridge/src/tools/runtime/delete_transaction.ts`
- Modify/Delete: `apps/whatsapp-bridge/src/tools/runtime/update_account.ts`
- Modify/Delete: `apps/whatsapp-bridge/src/tools/runtime/update_category.ts`
- Modify/Delete: `apps/whatsapp-bridge/src/tools/runtime/update_transaction.ts`
- Modify/Delete: `apps/whatsapp-bridge/src/tools/runtime/undo_last_action.ts`
- Modify/Delete: `apps/whatsapp-bridge/src/tools/runtime/list_categories.ts`
- Test/Delete: matching `*.test.ts` files for the 13 tools above

- [ ] Verify each of the 13 files still has zero non-test references with `grep`/`rg`.
- [ ] Remove the 13 implementation files only if references remain zero.
- [ ] Remove matching dead tests if they only cover removed files.
- [ ] Re-run search to prove zero dangling imports.
- [ ] Commit with message: `chore: remove dead runtime crud duplicates`

### Task 2: Put active runtime reminder path on explicit typecheck

**Files:**
- Modify: `apps/whatsapp-bridge/tsconfig.json`
- Create/Modify if needed: `apps/whatsapp-bridge/tsconfig.runtime.json`
- Verify: `apps/whatsapp-bridge/scripts/reminder.ts`
- Verify: `apps/whatsapp-bridge/scripts/data-provider.ts`
- Verify: `apps/whatsapp-bridge/src/tools/runtime/list_accounts.ts`
- Verify: `apps/whatsapp-bridge/src/tools/runtime/get_balance.ts`
- Verify: `apps/whatsapp-bridge/src/tools/runtime/list_recent_transactions.ts`
- Verify: `apps/whatsapp-bridge/src/tools/runtime/get_month_summary.ts`

- [ ] Confirm active reminder files are inside a `tsc --noEmit` path.
- [ ] Add a dedicated runtime tsconfig only if the main bridge tsconfig cannot safely express this scope.
- [ ] Keep the 4 active runtime tools and the 4 Tier B tools untouched.
- [ ] Run typecheck and capture exact passing command.
- [ ] Commit with message: `chore: typecheck active reminder runtime path`

### Task 3: Reduce low-risk extension typing debt

**Files:**
- Create: `.pi/extensions/financial-tools/types/db-row.ts`
- Modify: highest-leverage shared helpers and common query files under `.pi/extensions/financial-tools/tools/`
- Verify: `.pi/extensions/financial-tools/tsconfig.json`

- [ ] Introduce shared row interfaces only for the most repeated query shapes.
- [ ] Replace the highest-value `pool.query<any>`, `client.query<any>`, and `as unknown as T` in shared helpers/common paths first.
- [ ] Stop before risky refactors; reduction is enough, total elimination is not required.
- [ ] Re-run extension typecheck.
- [ ] Report before/after counts for `query<any>` and `as unknown as`.
- [ ] Commit with message: `refactor: reduce extension query typing debt`

### Task 4: Low-risk test hygiene

**Files:**
- Modify/Move if safe: `apps/whatsapp-bridge/src/tools/runtime/db.test.ts`
- Modify/Move if safe: `apps/whatsapp-bridge/src/tools/runtime/errors.test.ts`

- [ ] Determine whether moving these tests is trivial and risk-free.
- [ ] Move them only if imports stay intact and structure becomes clearer.
- [ ] If move is risky, leave them in place and document why.
- [ ] Commit with message: `chore: clarify runtime test placement` (only if changed)

### Task 5: Full validation

**Files:**
- Verify only

- [ ] Run bridge typecheck.
- [ ] Run extension typecheck.
- [ ] Run `.pi/extensions/financial-tools/test-smoke.ts`.
- [ ] Run `.pi/extensions/financial-tools/test-evolutions.ts`.
- [ ] Run `.pi/extensions/financial-tools/test-goals-budgets.ts`.
- [ ] Produce final report: changed files, commands, outcomes, residual debt.

---

## Guardrails
- Keep runtime and extension architectures separate.
- Do not remove the 4 active reminder runtime tools.
- Do not remove the 4 Tier B runtime tools in this pass.
- Prefer the smallest safe diff.
- If a wave expands beyond low-risk cleanup, stop and report before continuing.
