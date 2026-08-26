import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const checker = fileURLToPath(new URL("check-pwa-command-boundary.mjs", import.meta.url));
const repoRoot = fileURLToPath(new URL("..", import.meta.url));

function run(sourceRoot) {
  return spawnSync(process.execPath, [checker, "--source-root", sourceRoot], {
    cwd: repoRoot,
    encoding: "utf8",
  });
}

function fixture(source) {
  const root = mkdtempSync(path.join(os.tmpdir(), "pwa-boundary-"));
  mkdirSync(path.join(root, "lib"), { recursive: true });
  writeFileSync(path.join(root, "lib", "rogue.ts"), source);
  return root;
}

test("PWA command boundary has no unauthorized HTTP or business mutator callers", () => {
  const result = run(path.join(repoRoot, "apps", "pwa", "src"));
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /transport exemptions are allowlisted/);
});

test("rejects a direct raw fetch fixture", () => {
  const root = fixture('export const run = () => fetch("/rogue");');
  try {
    const result = run(root);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /raw fetch outside approved transport/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rejects axios and aliased apiFetch fixtures", () => {
  const root = fixture([
    'import axios from "axios";',
    'import { apiFetch as request } from "./client";',
    'export const run = () => axios.post("/rogue");',
    'export const read = () => request("/rogue");',
  ].join("\n"));
  try {
    const result = run(root);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /axios outside approved transport/);
    assert.match(result.stderr, /apiFetch outside approved endpoint layer/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rejects destructured and computed endpoint mutator fixtures", () => {
  const root = fixture([
    'import * as api from "./endpoints";',
    'const { createExpenseTransaction: save } = api;',
    'save({});',
    'api["createIncomeTransaction"]({});',
  ].join("\n"));
  try {
    const result = run(root);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /aliased business mutator bypasses commands.ts/);
    assert.match(result.stderr, /business mutator bypasses commands.ts/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
