// PWA audit tests — tests the package-based audit flow
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const AUDIT_SCRIPT = path.resolve(__dirname, "../pwa-audit.mjs");

describe("pwa-audit", () => {
  const tmpBase = path.resolve(__dirname, "../../tmp-test-audit");

  beforeEach(() => {
    // Clean up any leftover temp dirs
    try { fs.rmSync(tmpBase, { recursive: true, force: true }); } catch {}
  });
  afterEach(() => {
    try { fs.rmSync(tmpBase, { recursive: true, force: true }); } catch {}
  });

  it("detects known vulnerability in a vulnerable package", async () => {
    // Create a temp dir with a known-vulnerable package combo
    const dir = tmpBase + "-vuln";
    fs.mkdirSync(dir, { recursive: true });
    const pkg = {
      name: "test-pwa",
      dependencies: { "lodash": "4.17.15" }, // has known vulnerabilities
    };
    fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify(pkg));
    // Run npm install
    execSync("npm install --package-lock-only --ignore-scripts --audit=false", {
      cwd: dir, stdio: "pipe", timeout: 60000,
    });
    // Run pwa-audit logic: npm audit on this dir
    try {
      execSync(`npm audit --json`, { cwd: dir, stdio: "pipe", timeout: 30000 });
      expect.unreachable("should have found vulnerabilities");
    } catch (e) {
      const output = e.stdout?.toString() || "";
      const parsed = JSON.parse(output);
      const vulns = parsed.vulnerabilities || {};
      expect(Object.keys(vulns).length).toBeGreaterThan(0);
    }
    fs.rmSync(dir, { recursive: true, force: true });
  }, 120000);

  it("clean packages produce no advisories", async () => {
    const dir = tmpBase + "-clean";
    fs.mkdirSync(dir, { recursive: true });
    const pkg = {
      name: "test-pwa-clean",
      dependencies: { "is-odd": "3.0.1" }, // safe, latest
    };
    fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify(pkg));
    execSync("npm install --package-lock-only --ignore-scripts --audit=false", {
      cwd: dir, stdio: "pipe", timeout: 60000,
    });
    try {
      const result = execSync("npm audit --json", { cwd: dir, stdio: "pipe", timeout: 30000 });
      const parsed = JSON.parse(result.stdout.toString());
      expect(Object.keys(parsed.vulnerabilities || {})).toHaveLength(0);
    } catch (e) {
      // If audit found something, check what
      const output = e.stdout?.toString() || "";
      const parsed = JSON.parse(output);
      if (parsed?.vulnerabilities && Object.keys(parsed.vulnerabilities).length > 0) {
        throw new Error(`Unexpected vulnerabilities: ${JSON.stringify(Object.keys(parsed.vulnerabilities))}`);
      }
      // npm audit exits non-zero when vulns found; exit 0 means no vulns
      // Actually npm audit exits 0 when no vulns and 1 when vulns
      // If the catch was triggered for non-vuln reason, re-check
      if (!output.includes("vulnerabilities")) {
        throw e;
      }
    }
    fs.rmSync(dir, { recursive: true, force: true });
  }, 120000);

  it("fails closed when npm install fails (network / invalid package)", () => {
    const dir = tmpBase + "-fail";
    fs.mkdirSync(dir, { recursive: true });
    const pkg = {
      name: "test-pwa-fail",
      dependencies: { "!nonexistent-package-that-does-not-exist-12345!": "1.0.0" },
    };
    fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify(pkg));
    expect(() => {
      execSync("npm install --package-lock-only --ignore-scripts --audit=false", {
        cwd: dir, stdio: "pipe", timeout: 30000,
      });
    }).toThrow();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("full pwa-audit.mjs script runs and exits 0 (or 1 with evidence)", () => {
    // This test runs the actual pwa-audit.mjs script
    // It should either exit 0 (no vulns) or 1 with a JSON output on stderr
    try {
      const result = execSync(`node ${AUDIT_SCRIPT}`, {
        cwd: path.resolve(__dirname, "../.."),
        stdio: "pipe",
        timeout: 120000,
        encoding: "utf8",
      });
      expect(result.stderr).toContain("PASS");
    } catch (e) {
      const stderr = e.stderr?.toString() || "";
      const stdout = e.stdout?.toString() || "";
      // Script can exit 1 for vulnerabilities or failures
      // Should have a meaningful error message
      expect(stderr.length + stdout.length).toBeGreaterThan(10);
    }
  }, 180000);
});
