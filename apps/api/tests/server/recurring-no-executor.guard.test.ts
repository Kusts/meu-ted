import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { RECURRING_PURCHASES_EXECUTOR_ENABLED, recurringPurchasesCapability } from '../../src/cards/recurring-capability.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..', '..', '..');
const wranglerSource = readFileSync(resolve(repoRoot, 'apps/agent/wrangler.jsonc'), 'utf8');
const apiServerSource = readFileSync(resolve(repoRoot, 'apps/api/src/server/index.ts'), 'utf8');

/**
 * Phase 7 (V4.1 Task 7.9): recurring card purchases have no executor.
 *
 * Decision D9 (docs/reports/v4.1-decision-gates.md, RESOLVED): feature OFF /
 * incomplete (option A) — no scheduler/executor will be built; recurrence
 * rows are definition-only templates and nothing may materialize or pretend
 * otherwise (SPEC §14.4). This guard locks the proof of absence.
 */
describe('recurring purchases have no executor (Phase 7 guard, D9)', () => {
  it('agent worker declares no cron triggers', () => {
    const wrangler = JSON.parse(wranglerSource) as { triggers?: { crons?: unknown }; schedules?: unknown };
    expect(wrangler.triggers?.crons ?? []).toEqual([]);
    expect(wrangler.schedules).toBeUndefined();
    expect(wranglerSource).not.toMatch(/recurring/i);
  });

  it('API server composition wires no recurring scheduler or materializer', () => {
    expect(apiServerSource).not.toMatch(/recurring/i);
    const timers = apiServerSource.split('\n').filter((line) => line.includes('setInterval'));
    expect(timers.length).toBeGreaterThan(0);
    for (const line of timers) expect(line).toMatch(/runReminderJob/);
  });

  it('capability answer reports the feature as template-only without an executor', () => {
    expect(RECURRING_PURCHASES_EXECUTOR_ENABLED).toBe(false);
    expect(recurringPurchasesCapability()).toEqual({
      enabled: false,
      mode: 'template-only',
      reason: 'no-executor',
    });
  });
});
