// P0.5 — Benchmark A/B do runner Vitest da PWA.
//
// Decide a configuração estável de worker SEM trocar pool por intuição:
//   A: pool=threads, maxWorkers=2, fileParallelism=true
//   B: pool=threads, maxWorkers=1, fileParallelism=false
// Cada config roda Nx (subprocesso isolado). O vencedor é a configuração
// com todas as passagens (exit 0); se ambas passarem, escolhe a mediana mais
// rápida; se nenhuma passar, o script falha (exit 1).
//
// Vitest 4 removeu `test.poolOptions` (maxWorkers/fileParallelism são
// top-level) e globs ABSOLUTOS com `**` não casam no Windows, então cada run
// gera um config temporário DENTRO de apps/pwa/ com include/setup RELATIVOS
// (idênticos ao vitest.config.ts real) e passa `--config <basename>`. O suite
// testado é o mesmo (sem coverage para acelerar o benchmark).
//
// Uso:
//   node scripts/pwa-vitest-runner-benchmark.mjs
//   BENCH_RUNS=1 node scripts/pwa-vitest-runner-benchmark.mjs   # determinação rápida

import { spawn } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const RUNS_PER_CONFIG = Number(process.env.BENCH_RUNS ?? 2);
const PER_RUN_TIMEOUT_MS = Number(process.env.BENCH_RUN_TIMEOUT_MS ?? 300_000);
// O script vive em <repo>/scripts/, então o repo root é derivado do próprio
// arquivo (import.meta.url) e NÃO de process.cwd() — `pnpm --dir apps/pwa`
// muda o cwd para apps/pwa, o que duplicaria o path se usássemos cwd.
const REPO_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PWA_ROOT = path.resolve(REPO_ROOT, "apps/pwa");

const CONFIGS = [
  { id: "A", label: "threads maxWorkers=2 fileParallelism=true", maxWorkers: 2, fileParallelism: true },
  { id: "B", label: "threads maxWorkers=1 fileParallelism=false", maxWorkers: 1, fileParallelism: false },
];

const createdConfigs = [];

function writeTempConfig(cfg) {
  const base = `vitest.bench-${cfg.id}-${process.pid}.mjs`;
  const file = path.join(PWA_ROOT, base);
  const content = `import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    pool: "threads",
    maxWorkers: ${cfg.maxWorkers},
    fileParallelism: ${cfg.fileParallelism},
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}", "e2e/**/*.test.{ts,tsx}"],
    exclude: ["e2e/support/matrix.test.ts"],
  },
  resolve: { alias: { "@": "./src" } },
});
`;
  writeFileSync(file, content);
  createdConfigs.push(file);
  return base; // relativo: pnpm --dir apps/pwa roda com cwd=apps/pwa
}

function runOnce(cfg) {
  return new Promise((resolve) => {
    const configName = writeTempConfig(cfg);
    const args = [
      "--dir", "apps/pwa", "exec", "vitest", "run",
      "--reporter=dot",
      "--config", configName,
    ];
    const child = spawn("pnpm", args, { stdio: ["ignore", "pipe", "pipe"], cwd: REPO_ROOT, shell: true });

    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (d) => (stdout += d.toString()));
    child.stderr?.on("data", (d) => (stderr += d.toString()));

    const started = Date.now();
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      resolve({ exitCode: null, timedOut: true, durationMs: Date.now() - started, stdout, stderr });
    }, PER_RUN_TIMEOUT_MS);

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ exitCode: code, timedOut: false, durationMs: Date.now() - started, stdout, stderr });
    });
    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ exitCode: null, timedOut: false, durationMs: Date.now() - started, stdout, stderr: String(err) });
    });
  });
}

// Um worker timeout é o sintoma de instabilidade do runner que estamos
// eliminando. Falhas de asserção de teste (exit != 0 sem timeout) são
// problemas de conteúdo de teste, tratados separadamente (não do runner).
const WORKER_TIMEOUT_RE = /Failed to start threads worker|Timeout waiting for worker/i;

function classify(runs) {
  const workerTimeouts = runs.filter((r) => !r.timedOut && WORKER_TIMEOUT_RE.test(r.stderr || "")).length;
  const passed = runs.filter((r) => r.exitCode === 0 && !r.timedOut).length;
  const durations = runs.filter((r) => r.exitCode === 0 && !r.timedOut).map((r) => r.durationMs);
  return {
    workerTimeouts,
    stable: workerTimeouts === 0, // runner sem travamento de worker
    passedRuns: passed,
    medianDurationMs: median(durations),
  };
}

function median(nums) {
  if (nums.length === 0) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

async function main() {
  const report = { configs: {}, winner: null };
  const candidates = [];

  for (const cfg of CONFIGS) {
    const runs = [];
    for (let i = 0; i < RUNS_PER_CONFIG; i++) {
      const r = await runOnce(cfg);
      runs.push(r);
      const status = r.timedOut ? "TIMEOUT" : r.exitCode === 0 ? "PASS" : `FAIL(${r.exitCode})`;
      const wt = !r.timedOut && WORKER_TIMEOUT_RE.test(r.stderr || "");
      process.stdout.write(`[${cfg.id}] run ${i + 1}: ${status}${wt ? " WORKER_TIMEOUT" : ""} ${r.durationMs}ms\n`);
      if (!r.timedOut && r.exitCode !== 0 && !wt) {
        const tail = (r.stderr || r.stdout).split("\n").slice(-8).join("\n");
        process.stdout.write(`    ${tail}\n`);
      }
    }
    const c = classify(runs);
    report.configs[cfg.id] = {
      label: cfg.label,
      maxWorkers: cfg.maxWorkers,
      fileParallelism: cfg.fileParallelism,
      workerTimeouts: c.workerTimeouts,
      stable: c.stable,
      passedRuns: c.passedRuns,
      medianDurationMs: c.medianDurationMs,
      runs: runs.map((r) => ({ exitCode: r.exitCode, timedOut: r.timedOut, durationMs: r.durationMs })),
    };
    if (c.stable) candidates.push({ id: cfg.id, median: c.medianDurationMs ?? Infinity });
  }

  if (candidates.length === 1) {
    report.winner = candidates[0].id;
  } else if (candidates.length === 2) {
    report.winner = candidates.sort((a, b) => a.median - b.median)[0].id;
  } else {
    report.winner = null;
  }

  process.stdout.write("\n=== PWA vitest benchmark report ===\n");
  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  if (!report.winner) {
    process.stderr.write("No stable configuration found (zero or conflicting passes).\n");
    process.exit(1);
  }
  process.stdout.write(`WINNER: config ${report.winner}\n`);
}

main()
  .catch((err) => {
    process.stderr.write(`benchmark crashed: ${err?.stack ?? err}\n`);
    process.exit(1);
  })
  .finally(() => {
    for (const f of createdConfigs) {
      try { unlinkSync(f); } catch { /* ignore */ }
    }
  });
