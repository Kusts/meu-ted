#!/usr/bin/env node
/**
 * V4.1 Phase 9 (Task 9.5) — migration validation gate wrapper.
 *
 * Runs the API migration runner in read-only `--validate` mode when a
 * database URL is available; otherwise REPORTS a skip and exits 0 so
 * `validate:final` stays runnable on machines without Postgres.
 *
 * Resolves the connection string from DATABASE_URL (preferred) or
 * DATABASE_URL_TEST. Never applies migrations.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dbUrl = process.env.DATABASE_URL ?? process.env.DATABASE_URL_TEST;

if (!dbUrl) {
  console.log("migration-validate: SKIPPED — no DATABASE_URL/DATABASE_URL_TEST in env (reported, not failed).");
  process.exit(0);
}

try {
  const out = execFileSync(
    "pnpm",
    ["--filter", "meu-ted-api", "--fail-if-no-match", "exec", "tsx", "src/scripts/migrate.ts", "--validate"],
    { cwd: ROOT, encoding: "utf8", env: { ...process.env, DATABASE_URL: dbUrl } },
  );
  console.log(out.trimEnd());
} catch (err) {
  console.error((err.stdout || "") + (err.stderr || err.message || ""));
  process.exit(typeof err.status === "number" ? err.status : 1);
}
