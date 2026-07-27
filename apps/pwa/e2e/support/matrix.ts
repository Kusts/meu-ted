/**
 * E2E Coverage Matrix Auditor
 *
 * Parses the coverage matrix markdown and all E2E spec files,
 * then validates that every action ID is owned exactly once.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../../..");

export interface CoverageResult {
  pass: boolean;
  matrixIds: string[];
  specIds: Map<string, string>; // ID → spec file
  missing: string[];
  unknown: string[];
  duplicate: string[];
}

function extractMatrixIds(markdown: string): string[] {
  const ids: string[] = [];
  const lines = markdown.split("\n");
  let inTable = false;

  for (const line of lines) {
    // Detect table rows (start with | ID |)
    if (line.startsWith("| ID |")) {
      inTable = true;
      continue;
    }
    if (inTable && line.startsWith("|-")) continue; // separator row
    if (inTable && line.startsWith("## ")) break; // next heading ends table
    if (inTable && line.startsWith("|")) {
      const match = line.match(/^\|\s*([A-Z]+-\d+)\s*\|/);
      if (match) ids.push(match[1]);
    }
    // Table ends at blank line or next non-table content
    if (inTable && !line.startsWith("|") && line.trim() !== "") {
      // Still in table if line starts with |
    }
  }
  return ids;
}

function globSpecFiles(dir: string): string[] {
  const files: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // Skip guard-fixture
      if (entry.name === "guard-fixture") continue;
      files.push(...globSpecFiles(fullPath));
    } else if (entry.name.endsWith(".spec.ts")) {
      files.push(fullPath);
    }
  }
  return files;
}

function extractSpecIds(filePath: string): string[] {
  const content = fs.readFileSync(filePath, "utf8");
  const ids: string[] = [];
  // Match test('... [ID] ...') or it('... [ID] ...')
  // IDs may have optional lowercase suffix like REC-06a, REC-06b
  const regex = /\b(?:test|it)\s*\(\s*(?:["'][^"']*\[([A-Z]+-\d+[a-z]?)\][^"']*["']|`[^`]*\[([A-Z]+-\d+[a-z]?)\][^`]*`)/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    ids.push(match[1] || match[2]);
  }
  return ids;
}

export function auditCoverage(): CoverageResult {
  // 1. Read matrix markdown
  const matrixPath = path.join(ROOT, "docs", "testing", "pwa-e2e-coverage-matrix.md");
  const matrixMd = fs.readFileSync(matrixPath, "utf8");
  const matrixIds = extractMatrixIds(matrixMd);

  // 2. Glob all E2E specs
  const specsDir = path.join(ROOT, "apps", "pwa", "e2e", "specs");
  const specFiles = globSpecFiles(specsDir);

  // 3. Extract [ID] from each spec
  const specIds = new Map<string, string>(); // ID → first spec file
  const duplicate: string[] = [];
  const allSpecIds = new Set<string>();

  for (const specFile of specFiles) {
    const ids = extractSpecIds(specFile);
    for (const id of ids) {
      allSpecIds.add(id);
      if (specIds.has(id)) {
        if (!duplicate.includes(id)) {
          duplicate.push(id);
        }
      } else {
        specIds.set(id, specFile);
      }
    }
  }

  // 4. Compare — strip lowercase suffix from spec IDs for matching
  // (e.g., REC-06a → REC-06)
  const stripSuffix = (id: string) => id.replace(/[a-z]$/, "");
  const specBaseIds = new Map<string, string>(); // base ID → first spec file
  for (const [id, file] of specIds) {
    const base = stripSuffix(id);
    specBaseIds.set(base, file);
  }

  const missing = matrixIds.filter((id) => !specBaseIds.has(id));
  const unknown = [...allSpecIds].filter(
    (id) => !matrixIds.includes(id) && !matrixIds.includes(stripSuffix(id))
  );

  // Pass = no missing, no unknown, no duplicates
  const pass = missing.length === 0 && unknown.length === 0 && duplicate.length === 0;

  return {
    pass,
    matrixIds,
    specIds,
    missing,
    unknown,
    duplicate,
  };
}
