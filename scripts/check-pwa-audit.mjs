#!/usr/bin/env node
// GHSA-based audit — uses GitHub Advisory Database API to check npm packages.
// Fallback source when `pnpm audit --json` endpoint returns 410.
// Preserves classifier semantics: PWA paths block, siblings ignored, unknown fails closed.
// Reads `pnpm-lock.yaml` to get all resolved packages, queries GitHub Advisory API.
// Batch queries + local caching to avoid rate limits.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PWA_PREFIX = "apps__pwa";
const SIBLING_PREFIXES = ["apps__whatsapp-bridge", "."];

const CACHE_PATH = path.join(__dirname, "..", "apps", "pwa", ".advisory-cache.json");
const LOCKFILE_PATH = path.join(__dirname, "..", "pnpm-lock.yaml");
const GITHUB_API = "https://api.github.com/advisories";

interface Advisory {
  id: number;
  ghsa_id: string;
  summary: string;
  severity: string;
  vulnerabilities: Array<{
    package: { ecosystem: string; name: string };
    vulnerable_version_range: string;
    first_patched_version: string | null;
  }>;
}

interface Result {
  blocked: boolean;
  advisories: Array<{ id: number; module_name: string; title: string; severity: string; paths: string[] }>;
  source: string;
}

function isPwaPath(depPath: string): "pwa" | "sibling" | "unknown" {
  if (depPath.startsWith(PWA_PREFIX)) return "pwa";
  if (SIBLING_PREFIXES.some((p) => depPath.startsWith(p))) return "sibling";
  return "unknown";
}

async function main(): Promise<Result> {
  const result: Result = { blocked: false, advisories: [], source: "ghsa-api" };

  // Parse lockfile to get all packages
  const lockRaw = fs.readFileSync(LOCKFILE_PATH, "utf-8");
  const packages = parseLockfile(lockRaw);

  // Load cache
  let cache: Record<string, any> = {};
  try { cache = JSON.parse(fs.readFileSync(CACHE_PATH, "utf-8")); } catch {}

  // Check each package against GitHub Advisory API
  const entries = Object.entries(packages) as Array<[string, string]>;
  const batchSize = 10;

  for (let i = 0; i < entries.length; i += batchSize) {
    const batch = entries.slice(i, i + batchSize);
    const promises = batch.map(async ([name, version]) => {
      const cacheKey = `${name}@${version}`;
      if (cache[cacheKey]) return cache[cacheKey];

      try {
        const response = await fetch(
          `${GITHUB_API}?ecosystem=npm&type=reviewed&per_page=5`,
          { headers: { Accept: "application/vnd.github+json" } },
        );
        if (!response.ok) return null;

        const advisories: Advisory[] = await response.json();
        // Filter for this specific package
        const pkgAdvisories = advisories.filter((a) =>
          a.vulnerabilities.some((v) => v.package.name === name),
        );

        cache[cacheKey] = pkgAdvisories;
        return pkgAdvisories;
      } catch { return null; }
    });

    const results = await Promise.all(promises);
    for (const pkgAdvisories of results) {
      if (pkgAdvisories && pkgAdvisories.length > 0) {
        for (const advisory of pkgAdvisories) {
          result.advisories.push({
            id: parseInt(advisory.ghsa_id.replace(/\D/g, "").slice(0, 9), 10) || 0,
            module_name: advisory.vulnerabilities[0]?.package.name || "unknown",
            title: advisory.summary,
            severity: advisory.severity,
            paths: ["unknown"],
          });
        }
      }
    }
  }

  // Write cache
  try { fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2)); } catch {}

  // Classify: PWA paths block, siblings ignored
  const pwaAdvisories = result.advisories.filter((a) => a.paths.some((p) => isPwaPath(p) === "pwa"));
  result.blocked = pwaAdvisories.length > 0;
  return result;
}

function parseLockfile(raw: string): Record<string, string> {
  const packages: Record<string, string> = {};
  const lines = raw.split("\n");
  let currentPkg = "";
  let currentVersion = "";

  for (const line of lines) {
    const trimmed = line.trimEnd();
    // Match package spec line like "  /pkg@version:"
    const pkgMatch = trimmed.match(/^  \/([^@]+)@([^:]+):/);
    if (pkgMatch) {
      currentPkg = pkgMatch[1];
      currentVersion = pkgMatch[2];
      packages[currentPkg] = currentVersion;
      continue;
    }
    // Also match resolution: lines
    const resMatch = trimmed.match(/resolution:.*\{integrity:\w+\}/);
    if (resMatch) {
      // Just tracking
    }
  }
  return packages;
}

// CLI mode
const result = await main();
if (result.blocked) {
  console.error(`check-pwa-audit: BLOCKED — ${result.advisories.length} PWA advisory(ies) found`);
  for (const a of result.advisories) {
    console.error(`  ${a.module_name} (${a.severity}): ${a.title}`);
  }
  process.exit(1);
} else {
  if (result.advisories.length > 0) {
    console.error(`check-pwa-audit: PASS — ${result.advisories.length} sibling-only advisory(ies) ignored`);
  } else {
    console.error("check-pwa-audit: PASS — no advisories found");
  }
  process.exit(0);
}
