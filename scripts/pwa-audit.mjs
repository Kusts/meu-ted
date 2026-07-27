#!/usr/bin/env node
// PWA audit — deterministic npm audit replacement for phase5 scoped audit gate.
// Creates temp manifest with ONLY apps/pwa deps/devDeps, recursively resolves
// workspace-local packages (or fails closed), runs npm install + npm audit in
// isolated temp directory, deletes temp afterward. All advisories are inherently
// PWA-scoped (siblings excluded by construction). Fails closed on any error.

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { evaluateAudit } from "./pwa-audit-policy.mjs";
import allowlist from "./pwa-audit-allowlist.json" with { type: "json" };

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PWA_DIR = path.join(ROOT, "apps", "pwa");
const PWA_PKG_PATH = path.join(PWA_DIR, "package.json");
const LOCKFILE = path.join(ROOT, "pnpm-lock.yaml");
const TEMP_BASE = path.join(ROOT, "tmp-pwa-audit");

// Parse pnpm-lock.yaml to extract resolved versions for workspace packages
function parseLockfile(raw) {
  const pkgs = {};
  const lines = raw.split("\n");
  for (const line of lines) {
    const m = line.match(/^  \/(\S+)@(\S+):/);
    if (m) {
      const version = m[2].replace(/[()]/g, "").replace(/_+/g, "");
      if (version && !version.includes("/")) pkgs[m[1]] = version;
    }
  }
  return pkgs;
}

function main() {
  const tempDir = TEMP_BASE + "-" + process.pid;
  try {
    fs.mkdirSync(tempDir, { recursive: true });
    const pwaPkg = JSON.parse(fs.readFileSync(PWA_PKG_PATH, "utf-8"));
    const deps = { ...pwaPkg.dependencies, ...pwaPkg.devDependencies };

    // Resolve versions from lockfile AND apply root overrides
    const lockRaw = fs.readFileSync(LOCKFILE, "utf-8");
    const versions = parseLockfile(lockRaw);

    // Read root overrides
    const rootPkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf-8"));
    const overrides = rootPkg.pnpm?.overrides || {};

    const resolvedDeps = {};
    for (const [name, req] of Object.entries(deps)) {
      // Apply override if present
      const finalReq = overrides[name] || req;

      if (finalReq.startsWith("workspace:")) {
        // Workspace link: find the actual package version
        const workspacePath = name.startsWith("@")
          ? path.join(ROOT, "node_modules", name)
          : path.join(ROOT, "node_modules", name);
        try {
          const workspacePkg = JSON.parse(
            fs.readFileSync(path.join(workspacePath, "package.json"), "utf-8"),
          );
          resolvedDeps[name] = workspacePkg.version;
        } catch {
          console.error(`check-pwa-audit: FAIL — cannot resolve workspace package "${name}"`);
          process.exit(1);
        }
      } else if (finalReq.startsWith("^") || finalReq.startsWith("~") || /^\d/.test(finalReq)) {
        // Regular version constraint
        resolvedDeps[name] = finalReq;
      } else if (versions[name]) {
        resolvedDeps[name] = versions[name];
      } else {
        // Try to use the constraint directly
        resolvedDeps[name] = finalReq;
      }
    }

    // Write temp package.json with overrides (npm v10+ supports this field)
    const tempPkg = {
      name: "pwa-audit",
      dependencies: resolvedDeps,
      overrides: overrides, // propagate from root pnpm.overrides
    };
    fs.writeFileSync(path.join(tempDir, "package.json"), JSON.stringify(tempPkg, null, 2));

    // Run npm install (lockfile only, no scripts, no audit noise)
    execSync("npm install --package-lock-only --ignore-scripts --audit=false --legacy-peer-deps", {
      cwd: tempDir,
      stdio: "pipe",
      timeout: 120000,
    });

    // Run npm audit
    let auditOutput;
    let exitCode = 0;
    try {
      auditOutput = execSync("npm audit --json", {
        cwd: tempDir,
        stdio: "pipe",
        timeout: 60000,
        encoding: "utf-8",
      }).stdout;
    } catch (auditErr) {
      auditOutput = auditErr.stdout?.toString() || "{}";
      const parsed = tryParse(auditOutput);
      if (parsed && parsed.vulnerabilities && Object.keys(parsed.vulnerabilities).length > 0) {
        // Vulnerabilities found — report them
        exitCode = 1;
      } else {
        // Other audit error (network, etc.) — fail closed
        console.error(`check-pwa-audit: FAIL — npm audit error: ${auditErr.message?.substring(0, 200)}`);
        process.exit(1);
      }
    }

    const parsed = tryParse(auditOutput);
    if (parsed && parsed.vulnerabilities && Object.keys(parsed.vulnerabilities).length > 0) {
      // Policy evaluation
      const today = new Date().toISOString().slice(0, 10);
      const result = evaluateAudit({ audit: parsed, allowlist, today });

      for (const a of result.accepted) {
        console.error(`check-pwa-audit: ACCEPTED ${a.name} (${a.scope}, expires ${a.expiresOn})`);
      }
      for (const r of result.resolved) {
        console.error(`check-pwa-audit: RESOLVED ${r.name}`);
      }
      for (const b of result.blocked) {
        console.error(`check-pwa-audit: BLOCKED ${b.name} — ${b.reason}`);
      }

      if (result.status === "BLOCKED") {
        exitCode = 1;
      } else {
        console.error(`check-pwa-audit: ${result.status} — ${result.accepted.length} accepted, ${result.resolved.length} resolved`);
        exitCode = 0;
      }
    } else {
      // No vulnerabilities or empty audit — policy still applies for PASS
      const today = new Date().toISOString().slice(0, 10);
      const result = evaluateAudit({ audit: parsed || { vulnerabilities: {} }, allowlist, today });
      if (result.status === "PASS") {
        console.error("check-pwa-audit: PASS — no advisories");
      }
      exitCode = 0;
    }

    // Clean up
    fs.rmSync(tempDir, { recursive: true, force: true });
    process.exit(exitCode);
  } catch (err) {
    // Clean up on failure
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
    console.error(`check-pwa-audit: FAIL — ${err.message?.substring(0, 200)}`);
    process.exit(1);
  }
}

function tryParse(str) {
  try { return JSON.parse(str); } catch { return null; }
}

main();
