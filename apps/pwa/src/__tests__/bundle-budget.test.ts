// Bundle budget regression test.
//
// Reads apps/pwa/budget.json and the post-build measurements emitted by
// scripts/measure-bundle.mjs (run after `pnpm run build:cloudflare`). Asserts:
//   1. Initial gzip KB (framework+main+polyfills) does not regress >5% vs
//      budget.json.initialGzipKB.
//   2. Equivalent-set gzip KB does not regress >5% vs budget.json.totalGzipKB.
//
// budget.json.totalGzipKB is the equivalent-set baseline (re-baselined
// 2026-09-06 to 495.04 KB; see budget.json notes for the old->new history).
// Next.js 16.2.9 per-route AppRouter (624-*) and React error-decoder
// (3896037c-*) chunks are NOT application code and are excluded from the
// equivalent set. App/ lazy route chunks ARE part of the equivalent set —
// they are included, not excluded merely because lazy. The equivalent set is
// therefore "all chunks minus the 624-*/3896037c-* framework chunks".
//
// The regression gate is ONE-SIDED (upper bound): current <= baseline * 1.05.
// Being under baseline is an improvement, not a regression.

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import {
  classifyChunk,
  isAppLevel,
  summarize,
  passesBudget,
  verifyFrameworkPrefixesAgainstManifest,
} from "../../scripts/measure-bundle.mjs";

const APP_ROOT = path.resolve(__dirname, "..", "..");
const BUDGET_PATH = path.join(APP_ROOT, "budget.json");
const MEASURE_PATH = path.join(APP_ROOT, "scripts", "measure-bundle.mjs");
const CHUNKS_DIR = path.join(
  APP_ROOT,
  ".open-next",
  "assets",
  "_next",
  "static",
  "chunks",
);

interface MeasureJson {
  chunks: number;
  initialGzipKB: number;
  totalGzipKB: number;
  frameworkGzipKB: number;
  appLevelGzipKB: number;
  equivalentSetGzipKB: number;
}

function readBudget(): {
  initialGzipKB: number;
  totalGzipKB: number;
  regressionLimit: number;
} {
  return JSON.parse(fs.readFileSync(BUDGET_PATH, "utf-8"));
}

function measure(): MeasureJson {
  if (!fs.existsSync(CHUNKS_DIR)) {
    throw new Error(
      `No build output at ${CHUNKS_DIR}. Run \`pnpm run build:cloudflare\` first.`,
    );
  }
  const out = execFileSync("node", [MEASURE_PATH], {
    cwd: APP_ROOT,
    encoding: "utf-8",
  });
  const sentinel = "__MEASURE_BUNDLE_JSON__";
  const idx = out.lastIndexOf(sentinel);
  if (idx < 0)
    throw new Error("measure-bundle.mjs did not emit the JSON sentinel line");
  return JSON.parse(out.slice(idx + sentinel.length).trim());
}

// One-sided regression gate: current must not exceed baseline by more than limitPct.
function assertNoRegression(
  current: number,
  baseline: number,
  limitPct: number,
  label: string,
): void {
  const limit = baseline * (1 + limitPct / 100);
  expect(
    current,
    `${label}: ${current.toFixed(2)} KB must be <= ${limit.toFixed(2)} KB (baseline ${baseline} +${limitPct}%)`,
  ).toBeLessThanOrEqual(limit);
}

describe.skipIf(!fs.existsSync(CHUNKS_DIR))("bundle budget", () => {
  const budget = fs.existsSync(BUDGET_PATH) ? readBudget() : { regressionLimit: 5, initialGzipKB: 200, totalGzipKB: 280 };
  const m = fs.existsSync(CHUNKS_DIR) ? measure() : {} as MeasureJson;
  const limit = budget.regressionLimit;

  it("emits a measurement with all categories", () => {
    expect(m.chunks).toBeGreaterThan(0);
    expect(m.initialGzipKB).toBeGreaterThan(0);
    expect(m.totalGzipKB).toBeGreaterThan(0);
    expect(m.frameworkGzipKB).toBeGreaterThan(0);
    expect(m.appLevelGzipKB).toBeGreaterThan(0);
    expect(m.equivalentSetGzipKB).toBeGreaterThan(0);
  });

  it(`initial gzip KB does not regress >${limit}% of baseline (${budget.initialGzipKB})`, () => {
    assertNoRegression(m.initialGzipKB, budget.initialGzipKB, limit, "initial");
  });

  it(`equivalent-set gzip KB does not regress >${limit}% of baseline totalGzipKB (${budget.totalGzipKB})`, () => {
    assertNoRegression(
      m.equivalentSetGzipKB,
      budget.totalGzipKB,
      limit,
      "equivalent-set",
    );
  });
});

// ---------------------------------------------------------------------------
// Fixture unit tests — prove the methodology with synthetic chunk sets, not the
// live build. These pin the semantics the integration test relies on and make the
// 624-*/3896037c-* exclusion auditable (see measure-bundle.mjs header).
// ---------------------------------------------------------------------------
describe("bundle measure — fixture proofs", () => {
  // rows of [relativePath, gzipKB]
  const E = (rows: Array<[string, number]>) =>
    rows.map(([p, kb]) => ({ path: p, kb }));

  it("counts app/ lazy chunks and KEEPS them in the equivalent set (not excluded)", () => {
    const r = summarize(
      E([
        ["framework-abc.js", 10],
        ["89973f52-xyz.js", 100], // framework -> subtracted
        ["510-q.js", 21.69], // framework -> subtracted
        ["app/dashboard/index.js", 30], // app lazy
        ["app/settings/page.js", 5], // app lazy
        ["136-aaa.js", 40], // unknown/other -> included
      ]),
    );
    expect(r.appLevelGzipKB).toBeCloseTo(35, 5); // 30 + 5
    // total = 206.69, framework = 121.69 -> equivalent = 85
    expect(r.equivalentSetGzipKB).toBeCloseTo(85, 5);
    // app chunks are part of the equivalent set, never subtracted
    expect(r.equivalentSetGzipKB).toBeGreaterThan(r.appLevelGzipKB);
    expect(isAppLevel("app/dashboard/index.js")).toBe(true);
    expect(isAppLevel("89973f52-xyz.js")).toBe(false);
  });

  it("treats unknown chunks conservatively (included in equivalent set, never excluded)", () => {
    const r = summarize(
      E([
        ["mystery-chunk-9.js", 50], // matches no known prefix
        ["89973f52-xyz.js", 100], // framework -> subtracted
      ]),
    );
    // total = 150, framework = 100 -> equivalent = 50 (mystery MUST stay)
    expect(r.equivalentSetGzipKB).toBeCloseTo(50, 5);
    expect(r.frameworkGzipKB).toBeCloseTo(100, 5);
    expect(classifyChunk("mystery-chunk-9.js")).toBe("other");
  });

  it("gate: 294.735 KB passes, anything above fails (one-sided, baseline 280.7, +5%)", () => {
    const baseline = 280.7;
    const max = baseline * 1.05; // 294.735
    expect(max).toBeCloseTo(294.735, 3);
    expect(passesBudget(294.735, baseline, 0.05)).toBe(true);
    expect(passesBudget(294.73, baseline, 0.05)).toBe(true); // under the limit
    expect(passesBudget(294.74, baseline, 0.05)).toBe(false); // over the limit
    expect(passesBudget(300, baseline, 0.05)).toBe(false);
  });

  it("equivalent-set membership is stable across repeated classification", () => {
    const entries = E([
      ["framework-abc.js", 10],
      ["89973f52-xyz.js", 100],
      ["510-q.js", 21.69],
      ["app/dashboard/index.js", 30],
      ["136-aaa.js", 40],
    ]);
    const a = summarize(entries);
    const b = summarize(entries);
    expect(a).toEqual(b);
    // same name always classifies identically
    expect(classifyChunk("89973f52-cdab712dca2a9cf0.js")).toBe("framework");
    expect(classifyChunk("510-abf218878bab7e84.js")).toBe("framework");
    expect(classifyChunk("app/foo/page.js")).toBe("other");
    expect(classifyChunk("mystery-1.js")).toBe("other");
    expect(classifyChunk("framework-9.js")).toBe("initial");
    expect(classifyChunk("main-7.js")).toBe("initial");
  });

  it("verifies framework prefixes against build-manifest.json#rootMainFiles when present", () => {
    // Canonical evidence: Next.js lists 624-* and 3896037c-* as framework root files.
    const manifest = {
      json: {
        rootMainFiles: [
          "static/chunks/webpack-1ea83a7bda9eb7a6.js",
          "static/chunks/3896037c-5e38c9c2e2ee964a.js",
          "static/chunks/624-2d0a4df8d0e90c81.js",
          "static/chunks/main-app-8cb15600dee149a8.js",
        ],
      },
    };
    const v = verifyFrameworkPrefixesAgainstManifest(["624-", "3896037c-"], manifest);
    expect(v.verified).toBe(true);
    expect(v.missing).toEqual([]);
  });

  it("hard-fails verification if a pinned prefix is NOT in the framework manifest", () => {
    const manifest = { json: { rootMainFiles: ["static/chunks/webpack-x.js"] } };
    const v = verifyFrameworkPrefixesAgainstManifest(["624-", "3896037c-"], manifest);
    expect(v.verified).toBe(false);
    expect(v.missing).toEqual(["624-", "3896037c-"]);
  });
});

describe("bundle measure — fail-closed manifest check and composition report", () => {
  const makeFakeBuild = (rootMainFiles: string[]) => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "bundle-measure-"));
    fs.mkdirSync(path.join(cwd, ".open-next", "assets", "_next", "static", "chunks"), { recursive: true });
    fs.writeFileSync(
      path.join(cwd, ".open-next", "assets", "_next", "static", "chunks", "app-page.js"),
      "// fake app chunk for measurement",
    );
    fs.mkdirSync(path.join(cwd, ".next"), { recursive: true });
    fs.writeFileSync(
      path.join(cwd, ".next", "build-manifest.json"),
      JSON.stringify({ rootMainFiles }),
    );
    return cwd;
  };

  it("exits non-zero when the manifest cannot evidence the pinned framework prefixes", () => {
    const cwd = makeFakeBuild(["static/chunks/webpack-x.js", "static/chunks/main-app-y.js"]);
    expect(() =>
      execFileSync("node", [MEASURE_PATH], { cwd, encoding: "utf-8", stdio: "pipe" }),
    ).toThrow();
  });

  it("writes bundle-report.json with composition evidence when asked", () => {
    const cwd = makeFakeBuild([
      "static/chunks/webpack-x.js",
      "static/chunks/89973f52-y.js",
      "static/chunks/510-z.js",
      "static/chunks/main-app-w.js",
    ]);
    execFileSync("node", [MEASURE_PATH, "--write-report"], { cwd, encoding: "utf-8", stdio: "pipe" });
    const reportPath = path.join(cwd, "bundle-report.json");
    expect(fs.existsSync(reportPath)).toBe(true);
    const report = JSON.parse(fs.readFileSync(reportPath, "utf-8")) as {
      generatedAt: string;
      manifestVerified: boolean;
      chunks: number;
      equivalentSetGzipKB: number;
      topChunks: Array<{ path: string; kb: number }>;
    };
    expect(typeof report.generatedAt).toBe("string");
    expect(report.manifestVerified).toBe(true);
    expect(report.chunks).toBe(1);
    expect(report.equivalentSetGzipKB).toBeGreaterThan(0);
    expect(report.topChunks).toHaveLength(1);
    expect(report.topChunks[0]?.path).toContain("app-page.js");
    expect(typeof report.topChunks[0]?.kb).toBe("number");
  });
});
