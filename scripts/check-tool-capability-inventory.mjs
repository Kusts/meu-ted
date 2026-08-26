#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_INDEX = path.join(ROOT, '.pi', 'extensions', 'financial-tools', 'index.ts');
const DEFAULT_TOOL_ROOT = path.join(ROOT, '.pi', 'extensions', 'financial-tools');
const REQUIRED_COLUMNS = ['ID', 'Tool', 'Semantic capability', 'Persona', 'Frequency', 'Risk', 'API', 'UI', 'Destination', 'Coverage', 'kind', 'method', 'path', 'openapiOperationId', 'routeInventoryId', 'adapterExport', 'approval', 'status'];
const DESTINATIONS = new Set(['UI', 'chat', 'internal', 'retire']);
const RISKS = new Set(['low', 'medium', 'high', 'critical']);

const normalizeToolName = (value) => value.trim().replace(/^`|`$/g, '');

export function collectRegisteredTools(indexPath = DEFAULT_INDEX, toolRoot = DEFAULT_TOOL_ROOT) {
  const source = fs.readFileSync(indexPath, 'utf8');
  const imports = new Map();
  const importPattern = /import\s*\{([^\n]*?)\}\s*from\s*["'](\.\/(?:tools|generated)\/[^\n"']+)["'];/g;
  for (const match of source.matchAll(importPattern)) {
    const file = path.join(toolRoot, match[2].replace(/^\.\//, '').replace(/\.js$/, '.ts'));
    for (const item of match[1].split(',')) {
      const symbol = item.trim().split(/\s+as\s+/)[0];
      if (symbol) imports.set(symbol, file);
    }
  }

  const names = [];
  for (const symbol of source.matchAll(/registerTool\(pi,\s*([A-Za-z0-9_]+)\);/g)) {
    const file = imports.get(symbol[1]);
    if (!file || !fs.existsSync(file)) {
      names.push(symbol[1]);
      continue;
    }
    const toolSource = fs.readFileSync(file, 'utf8');
    const declaration = toolSource.match(new RegExp(`export const ${symbol[1]}[^=]*=\\s*\\{([\\s\\S]*?)(?:\\n\\};|\\};|$)`));
    const generatedAlias = toolSource.match(new RegExp(`\\bas\\s+${symbol[1]}\\b`));
    const explicitName = declaration?.[1].match(/\bname:\s*["']([^"']+)["']/)?.[1]
      ?? (generatedAlias
        ? symbol[1].replace(/Tool$/, '').replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)
        : toolSource.match(/\bname:\s*["']([^"']+)["']/)?.[1]);
    names.push(explicitName ?? symbol[1].replace(/Tool$/, '').replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`));
  }
  return names;
}

function splitTableRow(line) {
  return line.split('|').slice(1, -1).map((cell) => cell.trim());
}

export function validateInventory(inventoryPath, registeredTools) {
  const source = fs.readFileSync(inventoryPath, 'utf8');
  const lines = source.split(/\r?\n/);
  const headerLine = lines.find((line) => line.startsWith('| ID |'));
  const errors = [];
  if (!headerLine) return { rows: 0, tools: registeredTools.length, errors: ['inventory table header is missing'] };

  const columns = splitTableRow(headerLine);
  for (const column of REQUIRED_COLUMNS) {
    if (!columns.includes(column)) errors.push(`inventory is missing required column ${column}`);
  }
  if (columns.length !== REQUIRED_COLUMNS.length || REQUIRED_COLUMNS.some((column, index) => columns[index] !== column)) {
    errors.push(`inventory columns must be exactly: ${REQUIRED_COLUMNS.join(' | ')}`);
  }

  const rows = lines.filter((line) => /^\| CAP-\d{3} \|/.test(line)).map(splitTableRow);
  if (registeredTools.length !== rows.length) {
    errors.push(`registered ${registeredTools.length} tools but inventory has ${rows.length}`);
  }
  if (rows.length !== 72) errors.push(`inventory must contain 72 capability rows, found ${rows.length}`);

  const ids = rows.map((row) => row[0]);
  const expectedIds = Array.from({ length: rows.length }, (_, index) => `CAP-${String(index + 1).padStart(3, '0')}`);
  if (ids.some((id, index) => id !== expectedIds[index])) errors.push('capability IDs must be sequential CAP-001..CAP-NNN');

  const inventoryTools = rows.map((row) => normalizeToolName(row[1] ?? ''));
  const registeredSet = new Set(registeredTools);
  const inventorySet = new Set(inventoryTools);

  const toolCounts = new Map();
  for (const tool of inventoryTools) toolCounts.set(tool, (toolCounts.get(tool) ?? 0) + 1);
  for (const [tool, count] of toolCounts) if (count > 1) errors.push(`inventory tool ${tool} is duplicated ${count}x`);
  for (const tool of registeredSet) if (!inventorySet.has(tool)) errors.push(`registered tool ${tool} has no inventory row`);



  const columnIndex = Object.fromEntries(columns.map((column, index) => [column, index]));
  for (const row of rows) {
    const statusCell = row[columnIndex.status];
    const tool = normalizeToolName(row[1] ?? '');
    if (statusCell === 'api') {
      if (!row[columnIndex.method] || row[columnIndex.method] === '—') errors.push(`${id} is api but has no method`);
      if (!row[columnIndex.path] || row[columnIndex.path] === '—') errors.push(`${id} is api but has no path`);
    }
    if (statusCell !== 'planned' && !registeredSet.has(tool)) errors.push(`inventory tool ${tool} is not registered`);
  }

  for (const row of rows) {
    const id = row[0] ?? 'unknown row';
    if (row.length !== columns.length) errors.push(`${id} has ${row.length} cells, expected ${columns.length}`);
    for (const column of ['Semantic capability', 'Persona', 'Frequency', 'Risk', 'API', 'UI', 'Destination', 'Coverage']) {
      if (!row[columnIndex[column]]?.trim()) errors.push(`${id} is missing ${column}`);
    }
    const destination = row[columnIndex.Destination];
    if (destination && !DESTINATIONS.has(destination)) errors.push(`${id} has invalid destination ${destination}`);
    const risk = row[columnIndex.Risk];
    if (risk && !RISKS.has(risk)) errors.push(`${id} has invalid risk ${risk}`);
  }

  return { rows: rows.length, tools: registeredTools.length, errors };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = validateInventory(path.join(ROOT, 'docs', 'architecture', 'tool-capability-inventory.md'), collectRegisteredTools());
  if (result.errors.length) {
    console.error(result.errors.map((error) => `- ${error}`).join('\n'));
    process.exitCode = 1;
  } else {
    console.log(`Capability inventory valid: ${result.tools} registered tools / ${result.rows} classified rows`);
  }
}
