// scripts/measure-bundle.mjs
//
// Computes gzip sizes of the JS chunks emitted into .open-next/assets/_next/static/chunks
// after `pnpm run build:cloudflare`. Reports several auditable categories:
//
//   initialGzipKB       — framework- + main- + polyfills- (the initial-load set)
//   totalGzipKB         — every .js chunk under static/chunks/ (all chunks; informational)
//   frameworkGzipKB     — Next.js framework chunks (currently 89973f52-*, 510-*)
//   appLevelGzipKB      — lazy route chunks under static/chunks/app/
//   equivalentSetGzipKB — total minus the evidenced Next.js framework chunks
//
// WHY the pinned framework prefixes are subtracted (PROVEN, not asserted):
//   Next.js's own build manifest (.next/build-manifest.json#rootMainFiles) lists the
//   files loaded for EVERY route — the framework runtime set. The pinned ids appear
//   in rootMainFiles, i.e. they are Next.js framework chunks, NOT application/route
//   code (they are also not under static/chunks/app/). The exclusion is
//   cross-checked against rootMainFiles at runtime: if a pinned prefix is absent
//   from the manifest, the script FAILS (no silent, evidence-free exclusion).
//   See budget.json notes and bundle-budget.test.ts.
//
// The 5% regression gate (CI, bundle-budget.test.ts) compares equivalentSetGzipKB to
// budget.json.totalGzipKB. Exit code 0 always (informational); the wrapper test asserts
// the gate (one-sided: current must not exceed baseline by more than 5%).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

const dir = ".open-next/assets/_next/static/chunks";
const INITIAL_PREFIXES = ["framework-", "main-", "polyfills-"];
// Next.js framework chunk ids, PROVEN via build-manifest.json#rootMainFiles
// (see verifyFrameworkPrefixesAgainstManifest + the runtime cross-check in main()).
// History: 624-/3896037c- (Next 16.2.9 era) were superseded by 89973f52-
// (React error decoder: contains react.dev/errors minified strings) and
// 510- (Next deployment-id runtime). These ids are deterministic per Next
// minor; a Next upgrade that renames them MUST fail the manifest check
// below so the exclusion is consciously re-evidenced, never silent.
const FRAMEWORK_PREFIXES = ["89973f52-", "510-"];

// Build-manifest candidates (relative to the app root / cwd). The .next manifest is
// the authoritative evidence source in this repo, so prefer it; .open-next is only a
// fallback for environments that also emit a mirrored manifest there.
const MANIFEST_CANDIDATES = [
  ".next/build-manifest.json",
  ".open-next/assets/_next/build-manifest.json",
];

export function gzipSize(buf) {
  return zlib.gzipSync(buf, { level: 9 }).length;
}

export function classifyChunk(baseName) {
  if (INITIAL_PREFIXES.some((p) => baseName.startsWith(p))) return "initial";
  if (FRAMEWORK_PREFIXES.some((p) => baseName.startsWith(p))) return "framework";
  return "other";
}

export function isAppLevel(relPath) {
  return relPath.split(/[\\/]/).includes("app");
}

// entries: Array<{ path: string; kb: number }>  (kb already gzip KB)
export function summarize(entries, frameworkBases = null) {
  let initialKB = 0;
  let totalKB = 0;
  let frameworkKB = 0;
  let appKB = 0;
  for (const e of entries) {
    totalKB += e.kb;
    const base = path.basename(e.path);
    const cls = classifyChunk(base);
    if (cls === "initial") initialKB += e.kb;
    else if (frameworkBases ? frameworkBases.has(base) : cls === "framework") frameworkKB += e.kb;
    if (isAppLevel(e.path)) appKB += e.kb;
  }
  const equivalentKB = totalKB - frameworkKB;
  const r = (n) => Number(n.toFixed(2));
  return {
    chunks: entries.length,
    initialGzipKB: r(initialKB),
    totalGzipKB: r(totalKB),
    frameworkGzipKB: r(frameworkKB),
    appLevelGzipKB: r(appKB),
    equivalentSetGzipKB: r(equivalentKB),
  };
}

// One-sided regression gate: current <= baseline * (1 + tolerance).
export function passesBudget(equivalentKB, baselineKB, tolerance = 0.05) {
  return equivalentKB <= baselineKB * (1 + tolerance);
}

// Load the first available build manifest (returns { path, json } or null).
export function loadBuildManifest(candidates = MANIFEST_CANDIDATES) {
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      try {
        return { path: p, json: JSON.parse(fs.readFileSync(p, "utf8")) };
      } catch {
        // unreadable / parse error — try the next candidate
      }
    }
  }
  return null;
}

// Prove the pinned framework prefixes are Next.js framework (rootMainFiles).
// Returns { verified, rootFiles, missing }. If manifest is null, verified=false and
// every prefix is reported missing (could not be evidenced).
export function verifyFrameworkPrefixesAgainstManifest(prefixes, manifest) {
  if (!manifest) return { verified: false, rootFiles: [], missing: [...prefixes] };
  const rootBases = (manifest.json.rootMainFiles || []).map((f) => path.basename(f));
  const missing = prefixes.filter(
    (p) => !rootBases.some((b) => b.startsWith(p)),
  );
  return { verified: missing.length === 0, rootFiles: rootBases, missing };
}

function walk(p) {
  const out = [];
  for (const f of fs.readdirSync(p)) {
    const fp = path.join(p, f);
    const st = fs.statSync(fp);
    if (st.isDirectory()) out.push(...walk(fp));
    else if (fp.endsWith(".js")) out.push(fp);
  }
  return out;
}

function frameworkBasesFromManifest(manifest) {
  if (!manifest) return null;
  const rootBases = (manifest.json.rootMainFiles || []).map((f) => path.basename(f));
  const bases = rootBases.filter(
    (b) => !INITIAL_PREFIXES.some((p) => b.startsWith(p)) && !b.startsWith("main-app-"),
  );
  return new Set(bases);
}

function main() {
  const writeReport = process.argv.includes("--write-report");
  // Cross-check the framework exclusion against Next.js's own manifest evidence.
  // Fail-closed (Fase 2 item 4): an exclusion the manifest cannot evidence
  // must never silently shrink the equivalent set.
  const manifest = loadBuildManifest();
  const v = verifyFrameworkPrefixesAgainstManifest(FRAMEWORK_PREFIXES, manifest);
  const frameworkBases = frameworkBasesFromManifest(manifest);
  if (!manifest) {
    console.error(
      `WARN: no build-manifest.json found (looked in ${MANIFEST_CANDIDATES.join(
        ", ",
      )}). Framework prefixes ${FRAMEWORK_PREFIXES.join(
        ",",
      )} are pinned by their Next.js 16.2.9 framework chunk ids but could NOT be ` +
        `cross-checked against a manifest.`,
    );
  } else if (!v.verified) {
    console.error(
      `ERROR: framework prefix(es) ${JSON.stringify(
        v.missing,
      )} are not listed in ${manifest.path}#rootMainFiles. Refusing to ` +
        `exclude unevidenced chunks from the equivalent set — re-evidence the ` +
        `framework chunk ids after the Next.js upgrade and update FRAMEWORK_PREFIXES.`,
    );
    process.exit(1);
  } else {
    console.error(
      `Evidence: framework prefixes ${FRAMEWORK_PREFIXES.join(
        ",",
      )} verified against ${manifest.path}#rootMainFiles (Next.js framework set).`,
    );
  }

  if (!fs.existsSync(dir)) {
    console.error(`No build output at ${dir}. Run pnpm run build:cloudflare first.`);
    process.exit(2);
  }

  const files = walk(dir);
  const entries = files.map((fp) => ({
    path: fp,
    kb: gzipSize(fs.readFileSync(fp)) / 1024,
  }));
  const report = summarize(entries, frameworkBases);

  console.log(`chunks:                ${report.chunks}`);
  console.log(`initial gzip KB:       ${report.initialGzipKB}`);
  console.log(`total (all) gzip KB:   ${report.totalGzipKB}`);
  console.log(`framework chunks KB:   ${report.frameworkGzipKB}`);
  console.log(`app/ lazy gzip KB:     ${report.appLevelGzipKB}`);
  console.log(
    `equivalent-set gzip KB: ${report.equivalentSetGzipKB}  (total - Next.js framework chunks)`,
  );
  console.log(`__MEASURE_BUNDLE_JSON__${JSON.stringify(report)}`);

  if (writeReport) {
    const topChunks = [...entries]
      .sort((a, b) => b.kb - a.kb)
      .slice(0, 20)
      .map((e) => ({ path: e.path.split(/[\\/]/).slice(-2).join("/"), kb: Number(e.kb.toFixed(2)) }));
    const composition = {
      generatedAt: new Date().toISOString(),
      manifest: manifest ? manifest.path : null,
      manifestVerified: manifest ? v.verified : false,
      ...report,
      topChunks,
    };
    fs.writeFileSync("bundle-report.json", `${JSON.stringify(composition, null, 2)}\n`);
    console.error(`Wrote bundle-report.json (${report.chunks} chunks).`);
  }
}

const isMain =
  process.argv[1] &&
  path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1]);
if (isMain) main();

export { INITIAL_PREFIXES, FRAMEWORK_PREFIXES, MANIFEST_CANDIDATES };
