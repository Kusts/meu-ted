#!/usr/bin/env node
// Start PWA standalone correctly (fixes CSS 404 / interface quebrada).
// Next `output: standalone` nests server under .next/standalone/apps/pwa and
// requires copying .next/static + public before chdir — see e2e/standalone-server.mjs
// Direct `node .next/standalone/apps/pwa/server.js` from repo root fails with 404 on
// /_next/static/* because cwd is wrong.
// Usage: PORT=3002 node scripts/start-pwa-standalone.mjs
// or: pnpm pwa:prod (see package.json)

import { spawn } from "node:child_process";
import path from "node:path";

const pwaRoot = path.resolve(import.meta.dirname, "../apps/pwa");
const port = process.env.PORT ?? "3002";
console.log(`[pwa-standalone] starting on http://127.0.0.1:${port} via e2e/standalone-server.mjs (correct cwd + static copy)`);
const child = spawn("node", ["e2e/standalone-server.mjs"], {
  cwd: pwaRoot,
  env: { ...process.env, PORT: port },
  stdio: "inherit",
});
child.on("exit", (code) => process.exit(code ?? 0));
