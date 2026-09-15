/**
 * TED V3 real-model evals (SPEC §26) — gated Node entry point.
 *
 * Cost/safety gate: the runner only performs REAL provider calls when
 * TED_REAL_MODEL_EVAL=1. Without the flag it prints instructions and exits 0,
 * so CI/VAL.5 are never affected and no network call is attempted.
 *
 * Phase 1 (this process, dependency-free): gate + environment sanity
 * (booleans only — secret VALUES are never printed).
 * Phase 2 (child process): the vitest entry
 * `tests/ted-v3-real-model-evals.test.ts` resolves the first provider that
 * passes a 1-call smoke (opencode-zen → opencode-go → openrouter, overridable
 * via TED_REAL_MODEL_EVAL_PROVIDER / TED_REAL_MODEL_EVAL_MODEL), runs the 10
 * scenarios and writes the pt-BR report under evals/reports/. Non-zero exit
 * if any scenario fails (with the flag active).
 */
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = dirname(fileURLToPath(import.meta.url));
const agentDir = resolve(directory, '..');

const fail = (message) => {
  console.error(`TED V3 real-model evals: ${message}`);
  process.exit(1);
};

if (process.env.TED_REAL_MODEL_EVAL !== '1') {
  console.log('TED V3 real-model evals: SKIP — gate TED_REAL_MODEL_EVAL=1 not set (no real model calls, exit 0).');
  console.log('');
  console.log('Como executar (local):');
  console.log('  1) Exporte uma chave de provedor allowlisted:');
  console.log('     OPENCODE_ZEN_API_KEY | OPENCODE_GO_API_KEY | OPENROUTER_API_KEY');
  console.log('  2) PowerShell:  $env:TED_REAL_MODEL_EVAL = "1"');
  console.log('     bash:        TED_REAL_MODEL_EVAL=1');
  console.log('  3) node evals/run-ted-v3-real-model-evals.mjs   (ou pnpm eval:ted-v3)');
  console.log('');
  console.log('Overrides opcionais:');
  console.log('  TED_REAL_MODEL_EVAL_PROVIDER=opencode-zen|opencode-go|openrouter   (ordem default: opencode-zen → opencode-go → openrouter)');
  console.log('  TED_REAL_MODEL_EVAL_MODEL=<model-id>                               (default: primeiro modelo small/fast via GET /models)');
  console.log('');
  console.log('Relatório gerado em: apps/agent/evals/reports/ted-v3-real-model-evals-<data>.md');
  process.exit(0);
}

const aliasPresent = (alias) => Boolean(process.env[alias] && process.env[alias].trim() !== '');
console.log('TED V3 real-model evals: gate ativo (TED_REAL_MODEL_EVAL=1).');
console.log(`Chaves detectadas (apenas presença): OPENCODE_ZEN_API_KEY=${aliasPresent('OPENCODE_ZEN_API_KEY')}, OPENCODE_GO_API_KEY=${aliasPresent('OPENCODE_GO_API_KEY')}, OPENROUTER_API_KEY=${aliasPresent('OPENROUTER_API_KEY')}`);
if (process.env.TED_REAL_MODEL_EVAL_PROVIDER) console.log(`Provedor fixado: ${process.env.TED_REAL_MODEL_EVAL_PROVIDER}`);
if (process.env.TED_REAL_MODEL_EVAL_MODEL) console.log(`Modelo fixado: ${process.env.TED_REAL_MODEL_EVAL_MODEL}`);

let vitestEntry;
try {
  const require = createRequire(import.meta.url);
  const packageJson = require.resolve('vitest/package.json');
  vitestEntry = resolve(dirname(packageJson), 'vitest.mjs');
} catch {
  fail('vitest is not installed — run pnpm install in pi-finance-agent, then retry eval:ted-v3');
}

console.log('Executando os 10 cenários da SPEC §26 contra o modelo real (via vitest)…');
const child = spawnSync(
  process.execPath,
  [vitestEntry, 'run', 'tests/ted-v3-real-model-evals.test.ts', '--reporter=default'],
  { cwd: agentDir, stdio: 'inherit', env: process.env },
);
if (child.error) fail(`a suíte não pôde iniciar — ${child.error.message}`);
if (child.status !== 0) fail(`suíte falhou com exit code ${child.status} (relatório parcial em apps/agent/evals/reports/)`);
console.log('TED V3 real-model evals: verde. Relatório em apps/agent/evals/reports/.');
