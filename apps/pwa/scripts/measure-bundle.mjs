// scripts/measure-bundle.mjs
//
// Computes gzip sizes of the JS chunks emitted into .open-next/assets/_next/static/chunks
// after `pnpm run build:cloudflare`. Reports several auditable categories:
//
//   initialGzipKB       — framework- + main- + polyfills- (the initial-load set)
//   totalGzipKB         — every .js chunk under static/chunks/ (all chunks; informational)
//   frameworkGzipKB     — Next.js framework chunks (derived per-build from the
//                         build manifest — see below, never pinned by id)
//   appLevelGzipKB      — lazy route chunks under static/chunks/app/
//   equivalentSetGzipKB — total minus the evidenced Next.js framework chunks
//
// WHY the framework set is derived per-build, never pinned by chunk id
// (PROVEN 2026-09-14, fail-closed kept):
//   Next.js webpack chunk ids/hashes embed platform-dependent module paths:
//   identical source + lockfile yields e.g. 2262cfa8-/474- on Windows but
//   d398ea7c-/899- on Linux (verified with Linux node:22 + node:26 container
//   builds vs a Windows/Node 26 build — same manifest shape, different ids).
//   Committed id pins therefore trip on ENVIRONMENT, not on Next.js upgrades,
//   and can never be re-evidenced to a value valid in both dev and CI.
//   The exclusion stays evidenced, not asserted: the framework set is derived
//   from Next.js's own manifest (.next/build-manifest.json#rootMainFiles minus
//   the initial + main-app entries — i.e. the framework runtime Next.js loads
//   for EVERY route, which is definitionally not application/route code), and
//   the derivation is validated fail-closed: the manifest must exist, the
//   derived set must have exactly EXPECTED_FRAMEWORK_CHUNK_COUNT members, and
//   every member must exist on disk under static/chunks/ outside app/.
//   A Next.js upgrade that changes the framework set SHAPE still trips the
//   gate for conscious re-evidence — an environment change no longer does.
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
// Expected SHAPE of the manifest-derived framework set: currently the webpack
// runtime + 2 framework chunks (rootMainFiles minus initial/main-app). This
// count is environment-independent (proven identical on Linux node:22/26 and
// Windows/Node 26 — only the ids/hashes vary). A Next.js upgrade that adds or
// removes framework root files MUST trip the validation below so the new
// shape is consciously re-evidenced, never silently absorbed.
const EXPECTED_FRAMEWORK_CHUNK_COUNT = 3;

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

/**
 * @param {string} baseName
 * @param {Set<string> | null} [frameworkBases] manifest-derived evidence; without it nothing is framework
 */
export function classifyChunk(baseName, frameworkBases = null) {
  if (INITIAL_PREFIXES.some((p) => baseName.startsWith(p))) return "initial";
  // Framework membership comes ONLY from the manifest-derived set (never from
  // pinned ids — chunk ids vary by build environment). Without that evidence
  // a chunk is conservatively "other" (included in the equivalent set).
  if (frameworkBases ? frameworkBases.has(baseName) : false) return "framework";
  return "other";
}

export function isAppLevel(relPath) {
  return relPath.split(/[\\/]/).includes("app");
}

// entries: Array<{ path: string; kb: number }>  (kb already gzip KB)
/**
 * @param {Array<{ path: string, kb: number }>} entries
 * @param {Set<string> | null} [frameworkBases] manifest-derived evidence; without it nothing is subtracted
 */
export function summarize(entries, frameworkBases = null) {
  let initialKB = 0;
  let totalKB = 0;
  let frameworkKB = 0;
  let appKB = 0;
  for (const e of entries) {
    totalKB += e.kb;
    const base = path.basename(e.path);
    const cls = classifyChunk(base, frameworkBases);
    if (cls === "initial") initialKB += e.kb;
    else if (cls === "framework") frameworkKB += e.kb;
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

// Prove the framework exclusion against Next.js's own manifest evidence.
// Returns { ok, reason, frameworkBases }. Fail-closed (Fase 2 item 4): any
// exclusion the manifest cannot evidence must never silently shrink the
// equivalent set. `chunkFiles` maps walked chunk basenames to their relative
// paths (used to prove every derived member exists on disk, outside app/).
/**
 * @param {{ json: { rootMainFiles?: string[] } } | null} manifest
 * @param {Map<string, string[]>} chunkFiles
 * @returns {{ ok: boolean, reason: string, frameworkBases: Set<string> | null }}
 */
export function validateFrameworkSet(manifest, chunkFiles) {
  if (!manifest) {
    return { ok: false, reason: "no build-manifest.json found", frameworkBases: null };
  }
  const frameworkBases = frameworkBasesFromManifest(manifest);
  const members = [...frameworkBases];
  if (members.length === 0) {
    return { ok: false, reason: "derived framework set is empty", frameworkBases: null };
  }
  if (members.length !== EXPECTED_FRAMEWORK_CHUNK_COUNT) {
    return {
      ok: false,
      reason:
        `derived framework set has ${members.length} member(s) [${members.join(", ")}], ` +
        `expected ${EXPECTED_FRAMEWORK_CHUNK_COUNT} — re-evidence the framework ` +
        `chunk set shape after the Next.js upgrade and update EXPECTED_FRAMEWORK_CHUNK_COUNT`,
      frameworkBases: null,
    };
  }
  for (const base of members) {
    const rels = chunkFiles.get(base) || [];
    if (rels.length === 0) {
      return { ok: false, reason: `framework chunk ${base} is not on disk under ${dir}`, frameworkBases: null };
    }
    if (rels.some((r) => isAppLevel(r))) {
      return { ok: false, reason: `framework chunk ${base} lives under app/ — refusing to exclude route code`, frameworkBases: null };
    }
  }
  return { ok: true, reason: "", frameworkBases };
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

/**
 * @param {{ json: { rootMainFiles?: string[] } } | null} manifest
 * @returns {Set<string>} rootMainFiles basenames minus initial/main-app entries (empty when no manifest)
 */
export function frameworkBasesFromManifest(manifest) {
  if (!manifest) return new Set();
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
  if (!fs.existsSync(dir)) {
    console.error(`No build output at ${dir}. Run pnpm run build:cloudflare first.`);
    process.exit(2);
  }

  const files = walk(dir);
  const chunkFiles = new Map();
  for (const fp of files) {
    const base = path.basename(fp);
    if (!chunkFiles.has(base)) chunkFiles.set(base, []);
    chunkFiles.get(base).push(path.relative(dir, fp));
  }
  const manifest = loadBuildManifest();
  const v = validateFrameworkSet(manifest, chunkFiles);
  if (!v.ok) {
    console.error(
      `ERROR: cannot evidence the Next.js framework chunk exclusion${manifest ? ` (${manifest.path}#rootMainFiles)` : ""}: ${v.reason}. ` +
        `Refusing to exclude unevidenced chunks from the equivalent set.`,
    );
    process.exit(1);
  }
  console.error(
    `Evidence: framework set [${[...v.frameworkBases].join(", ")}] derived from ` +
      `${manifest.path}#rootMainFiles (Next.js framework set).`,
  );
  const frameworkBases = v.frameworkBases;
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
      manifestVerified: v.ok,
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

export { INITIAL_PREFIXES, MANIFEST_CANDIDATES, EXPECTED_FRAMEWORK_CHUNK_COUNT };
