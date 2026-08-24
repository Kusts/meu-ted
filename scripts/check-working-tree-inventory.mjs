import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const VALID_CLASSES = Object.freeze([
  'project-wip',
  'generated-artifact',
  'tooling',
  'documentation',
  'temporary',
  'secret-sensitive',
]);

export const VALID_ACTIONS = Object.freeze([
  'preserve',
  'preserve-redacted',
  'review',
]);

const SECRET_PATH_PATTERN = /(\.env(?:\.|$)|\.pem$|\.key$|credential|secret|token|cookie|password)/i;
const GENERATED_PATH_PATTERN = /(^|\/)(dist|build|coverage|\.next|\.turbo)(\/|$)/i;
const TEMPORARY_PATH_PATTERN = /(^|\/)(tmp|temp|backup)(\/|$)|\.bak$/i;
const DOCUMENTATION_PATH_PATTERN = /(^|\/)(docs?|README|CHANGELOG|ROADMAP|PRODUCT|ARCHITECTURE|AGENTS)(\/|\.|$)/i;
const TOOLING_PATH_PATTERN = /(^|\/)(scripts|\.pi|\.github|config|infra)(\/|$)/i;

function normalizePath(path) {
  return path.replaceAll('\\', '/').replace(/^\.\//, '');
}

function parsePorcelainStatus(output) {
  const records = output.split('\0').filter(Boolean);
  const paths = [];

  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    const status = record.slice(0, 2);
    const path = normalizePath(record.slice(3));
    if (!path) continue;

    paths.push({ path, status });
    if (/[RC]/.test(status) && records[index + 1]) {
      paths.push({ path: normalizePath(records[index + 1]), status });
      index += 1;
    }
  }

  return paths;
}

export function collectWorkingTreeRecords() {
  const output = execFileSync(
    'git',
    ['status', '--porcelain=v1', '--untracked-files=all', '-z'],
    { encoding: 'utf8' },
  );
  return parsePorcelainStatus(output);
}

export function collectWorkingTreePaths() {
  return collectWorkingTreeRecords().map(({ path }) => path);
}

function ownerForPath(path) {
  if (path.startsWith('apps/api/') || path.startsWith('.pi/extensions/')) return 'P1';
  if (path.startsWith('apps/whatsapp-bridge/')) return 'P2';
  if (path.startsWith('docs/')) return 'P4';
  return 'P0';
}

function classificationForPath(path, status = '') {
  const normalized = normalizePath(path);
  const lower = normalized.toLowerCase();

  if (SECRET_PATH_PATTERN.test(lower)) {
    return {
      class: 'secret-sensitive',
      action: 'preserve-redacted',
      rationale: 'Preserve the path for ownership tracking; never read or record its contents.',
    };
  }
  if (GENERATED_PATH_PATTERN.test(lower)) {
    return {
      class: 'generated-artifact',
      action: 'review',
      rationale: 'Generated output is retained until its producing workflow and cleanup owner are verified.',
    };
  }
  if (TEMPORARY_PATH_PATTERN.test(lower)) {
    return {
      class: 'temporary',
      action: 'review',
      rationale: 'Temporary or backup material is retained pending explicit ownership and rollback review.',
    };
  }
  if (DOCUMENTATION_PATH_PATTERN.test(lower)) {
    return {
      class: 'documentation',
      action: 'preserve',
      rationale: 'Documentation is preserved and assigned to the appropriate pending-closure phase.',
    };
  }
  if (TOOLING_PATH_PATTERN.test(lower)) {
    return {
      class: 'tooling',
      action: 'preserve',
      rationale: 'Tooling is preserved while the stabilization and validation commands are reconciled.',
    };
  }

  return {
    class: 'project-wip',
    action: 'preserve',
    rationale: status.startsWith('??')
      ? 'Untracked project WIP is preserved exactly as found; no contents are inferred or changed.'
      : 'Tracked project WIP is preserved exactly as found pending its owning delivery.',
  };
}

export function buildInventory(paths) {
  return paths.map((item) => {
    const record = typeof item === 'string' ? { path: item, status: '' } : item;
    const path = normalizePath(record.path);
    return {
      path,
      ...classificationForPath(path, record.status),
      owner: ownerForPath(path),
    };
  });
}

export function checkInventory({ porcelainPaths, inventoryCount }) {
  if (!Array.isArray(porcelainPaths)) throw new TypeError('porcelainPaths must be an array');
  if (typeof inventoryCount !== 'number') throw new TypeError('inventoryCount must be a number');
  const count = porcelainPaths.length;
  if (count !== inventoryCount) {
    return { ok: false, reason: `count mismatch: porcelain ${count} != inventory ${inventoryCount}` };
  }
  return { ok: true, reason: '' };
}

export function validateInventory(inventory) {
  if (!Array.isArray(inventory)) throw new TypeError('inventory must be an array');

  const seen = new Set();
  for (const entry of inventory) {
    if (!entry || typeof entry !== 'object') throw new TypeError('inventory entry must be an object');
    if (!entry.path || typeof entry.path !== 'string') throw new Error('path is required');
    if (seen.has(entry.path)) throw new Error(`duplicate path: ${entry.path}`);
    seen.add(entry.path);
    if (!VALID_CLASSES.includes(entry.class)) throw new Error(`invalid class for ${entry.path}`);
    if (!/^P[0-5]$/.test(entry.owner)) throw new Error(`invalid owner for ${entry.path}`);
    if (!VALID_ACTIONS.includes(entry.action)) throw new Error(`invalid action for ${entry.path}`);
    if (typeof entry.rationale !== 'string' || !entry.rationale.trim()) {
      throw new Error(`rationale is required for ${entry.path}`);
    }
    if (entry.class === 'secret-sensitive' && entry.action !== 'preserve-redacted') {
      throw new Error(`secret-sensitive path must be redacted: ${entry.path}`);
    }
  }

  return { count: inventory.length };
}

function escapeTableCell(value) {
  return String(value).replaceAll('|', '\\|').replaceAll('\n', ' ');
}

export function formatInventoryMarkdown(inventory, dateStr = '2026-08-24') {
  const { count } = validateInventory(inventory);
  const rows = inventory
    .map((entry) => `| ${escapeTableCell(entry.path)} | ${entry.class} | ${entry.owner} | ${entry.action} | ${escapeTableCell(entry.rationale)} |`)
    .join('\n');

  return [
    `# Working Tree Inventory — ${dateStr}`,
    '',
    '## Safety boundary',
    '',
    `- Inventory count: ${count}`, 
    '- Source: `git status --porcelain=v1 --untracked-files=all`.',
    '- Only paths and safe classification metadata are recorded; file contents, secrets, tokens, cookies, passwords, private keys, and database URLs are excluded.',
    '- Existing WIP is preserved. No path is deleted, moved, overwritten, or added to `.gitignore` by this inventory.',
    '',
    '## Classification enum',
    '',
    `- class: ${VALID_CLASSES.map((value) => `\`${value}\``).join(', ')}`,
    `- action: ${VALID_ACTIONS.map((value) => `\`${value}\``).join(', ')}`,
    '- owner: `P0` through `P5`.',
    '',
    '## Paths',
    '',
    '| path | class | owner | action | rationale |',
    '| --- | --- | --- | --- | --- |',
    rows,
    '',
  ].join('\n');
}
export function writeInventoryDocument(inventory, outputPath = 'docs/recovery/2026-08-16-working-tree-inventory.md', dateStr = '2026-08-24') {
  writeFileSync(outputPath, formatInventoryMarkdown(inventory, dateStr), 'utf8');
  return outputPath;
}

function main() {
  const inventory = buildInventory(collectWorkingTreeRecords());
  const summary = validateInventory(inventory);
  if (process.argv.includes('--json')) {
    process.stdout.write(`${JSON.stringify({ summary, inventory }, null, 2)}\n`);
    return;
  }
  process.stdout.write(formatInventoryMarkdown(inventory));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
