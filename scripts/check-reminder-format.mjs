import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const files = [
  "apps/api/src/push/reminder-scheduler.ts",
  "apps/api/src/push/reminder-postgres.ts",
  "apps/api/tests/push/reminder-scheduler.test.ts",
  "apps/api/tests/push/reminder-postgres.test.ts",
  "apps/api/tests/integration/postgres-reminder-dedupe.test.ts",
  "apps/api/package.json",
];
const prettier = resolve(
  root,
  "node_modules/.pnpm/prettier@3.6.2/node_modules/prettier/bin/prettier.cjs",
);
const biome = resolve(
  root,
  "node_modules/.pnpm/@biomejs+biome@2.2.4/node_modules/@biomejs/biome/bin/biome",
);
const run = (command, args) => {
  const result = spawnSync(process.execPath, [command, ...args], {
    cwd: root,
    stdio: "inherit",
  });
  return result.status ?? 1;
};
const prettierStatus = run(prettier, ["--check", ...files]);
if (prettierStatus !== 0) process.exit(prettierStatus);
process.exit(run(biome, ["check", ...files]));
