/**
 * TED V2 regression evals (SPEC AGENT-011) — thin Node entry point.
 *
 * Phase 1 (this process, dependency-free): matrix integrity + SPEC category
 * minimums. Phase 2 (child process): behavioral execution against the REAL
 * agent modules. Phase 2 runs under vitest because two core modules
 * (`conversation-orchestrator.ts`, `mutation-executor.ts`) use TypeScript
 * parameter properties, which this runtime's strip-only type support cannot
 * load under plain `node` — the agent test suite (vitest/esbuild) is the
 * existing, supported pattern for importing TS here. No new dependency:
 * vitest is already a devDependency of pi-finance-agent.
 *
 * Any behavioral regression fails this runner via the child's exit code.
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const directory = dirname(fileURLToPath(import.meta.url));
const agentDir = resolve(directory, '..');
const source = resolve(directory, 'ted-v2-regression-matrix.json');
const scenarios = JSON.parse(await readFile(source, 'utf8'));

const categories = new Set(['route', 'tool', 'arguments', 'confirmation', 'grounding', 'execution']);
const decisions = new Set(['allow', 'deny', 'ask_confirmation', 'ask_clarification', 'grounding_required', 'retry']);
const specCategories = new Map([
  ['consultas', 10],
  ['mutações', 12],
  ['segurança/aprovação', 10],
  ['ambiguidades', 8],
  ['indisponibilidades', 5],
  ['conversação/memória', 5],
]);
const execKinds = new Set([
  'router', 'plan', 'provider-output', 'normalize', 'parse', 'confirm', 'resolve',
  'orch-propose', 'orch-confirm', 'orch-idempotency', 'orch-read', 'orch-chat',
  'ground', 'evidence', 'executor',
]);

const fail = (message) => { throw new Error(`TED V2 eval matrix: ${message}`); };

/* Phase 1a — legacy integrity (unchanged semantics). */
if (!Array.isArray(scenarios) || scenarios.length < 50) fail('requires at least 50 scenarios');
if (new Set(scenarios.map((scenario) => scenario.id)).size !== scenarios.length) fail('scenario ids must be unique');
for (const scenario of scenarios) {
  if (!/^TEDV2-\d{3}$/.test(scenario.id)) fail(`invalid id ${scenario.id}`);
  if (!categories.has(scenario.category)) fail(`invalid category for ${scenario.id}`);
  if (!decisions.has(scenario.expected?.decision)) fail(`invalid decision for ${scenario.id}`);
  if (!['none', 'at_most_one_mutation'].includes(scenario.expected?.sideEffects)) fail(`invalid side effect bound for ${scenario.id}`);
  if (scenario.expected?.llm !== 'not_required') fail(`LLM is prohibited in deterministic eval ${scenario.id}`);
  if (!scenario.invariant || scenario.invariant.trim().length < 11) fail(`missing invariant for ${scenario.id}`);
}

/* Phase 1b — behavioral wiring: every scenario declares a SPEC category and an executable behavior. */
const counts = new Map([...specCategories.keys()].map((category) => [category, 0]));
for (const scenario of scenarios) {
  if (!specCategories.has(scenario.specCategory)) fail(`invalid specCategory for ${scenario.id}`);
  counts.set(scenario.specCategory, counts.get(scenario.specCategory) + 1);
  if (!execKinds.has(scenario.exec?.kind)) fail(`missing/invalid exec.kind for ${scenario.id}`);
  if (!scenario.expect || typeof scenario.expect !== 'object') fail(`missing expect for ${scenario.id}`);
}
const deficits = [...specCategories.entries()]
  .filter(([category, minimum]) => (counts.get(category) ?? 0) < minimum)
  .map(([category, minimum]) => `${category}: ${counts.get(category) ?? 0}/${minimum}`);
if (deficits.length > 0) fail(`spec minimums unmet — ${deficits.join('; ')}`);

console.log(`TED V2 matrix integrity passed: ${scenarios.length} scenarios.`);
console.log('SPEC AGENT-011 minimums:');
for (const [category, minimum] of specCategories) {
  console.log(`  ${category}: ${counts.get(category)}/${scenarios.length} scenarios (minimum ${minimum})`);
}

/* Phase 2 — behavioral execution against the real modules via the agent test suite. */
let vitestEntry;
try {
  const require = createRequire(import.meta.url);
  const packageJson = require.resolve('vitest/package.json');
  vitestEntry = resolve(dirname(packageJson), 'vitest.mjs');
} catch {
  fail('vitest is not installed — run pnpm install in pi-finance-agent, then retry eval:ted-v2');
}
console.log('TED V2 behavioral suite: executing scenarios against real modules…');
const child = spawnSync(process.execPath, [vitestEntry, 'run', 'tests/ted-v2-regression-evals.test.ts', '--reporter=default'], {
  cwd: agentDir,
  stdio: 'inherit',
  env: process.env,
});
if (child.error) fail(`behavioral suite could not start — ${child.error.message}`);
if (child.status !== 0) fail(`behavioral suite failed with exit code ${child.status} (see per-category report above)`);
console.log('TED V2 deterministic evals passed: matrix integrity + behavioral execution green.');
