#!/usr/bin/env node
/**
 * Enforces the PWA HTTP boundary.
 *
 * Business writes may be declared in api/endpoints.ts, but callers must use
 * state/commands.ts. Read/bootstrap transport and infrastructure telemetry
 * are explicit, narrow exemptions. The checker also resolves common import,
 * namespace, destructuring, alias, and computed-call forms.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_SOURCE_ROOT = path.join(process.cwd(), "apps", "pwa", "src");
const MUTATORS = [
  "createExpenseTransaction", "createIncomeTransaction", "updateTransaction", "deleteTransaction",
  "createTransfer", "addAccount", "updateAccount", "deactivateAccount", "addCategory", "updateCategory",
  "deactivateCategory", "createCard", "updateCard", "updateCardPurchase", "payStatement", "createInstallments",
  "addSubscription", "cancelSubscription", "updateSubscription", "createPayable", "markPayablePaid",
  "undoPayablePayment", "cancelPayable", "updatePayable", "createBudget", "updateBudget", "createGoal",
  "contributeToGoal", "cancelGoal", "updateGoal", "patchProfile",
];
const HTTP_NAMES = ["fetch", "axios", "apiFetch", "appFetch", "rawFetch"];

const normalize = (value) => value.replaceAll(path.sep, "/");
const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function collectFiles(directory) {
  const files = [];
  function visit(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const file = path.join(current, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.(ts|tsx)$/.test(entry.name)) files.push(file);
    }
  }
  visit(directory);
  return files;
}

function moduleImports(source, kind) {
  const aliases = new Set();
  const byName = new Map();
  const namespaces = new Set();
  const importPattern = /import\s+([\s\S]*?)\s+from\s+["']([^"']+)["']\s*;?/g;
  for (const match of source.matchAll(importPattern)) {
    const clause = match[1].trim();
    const moduleName = match[2];
    const matchesKind = kind === "axios"
      ? moduleName === "axios"
      : moduleName.includes(kind);
    if (!matchesKind) continue;

    const namespace = clause.match(/\*\s+as\s+([A-Za-z_$][\w$]*)/);
    if (namespace) namespaces.add(namespace[1]);
    if (kind === "axios" && !namespace && /^[A-Za-z_$][\w$]*/.test(clause)) {
      aliases.add(clause.match(/^([A-Za-z_$][\w$]*)/)?.[1]);
    }

    const named = clause.match(/\{([\s\S]*)\}/)?.[1];
    if (named) {
      for (const item of named.split(",")) {
        const [original, local] = item.trim().split(/\s+as\s+/);
        if (original && (kind === "endpoints" ? MUTATORS.includes(original) : HTTP_NAMES.includes(original))) {
          const alias = local ?? original;
          aliases.add(alias);
          if (!byName.has(original)) byName.set(original, new Set());
          byName.get(original).add(alias);
        }
      }
    }
  }
  return { aliases: new Set([...aliases].filter(Boolean)), byName, namespaces };
}

function assignmentAliases(source, namespaces, names) {
  const aliases = new Set();
  const sourceNames = [...names].map(escape).join("|");
  for (const namespace of ["endpoints", ...namespaces]) {
    const destructure = new RegExp(`(?:const|let|var)\\s*\\{([^}]*)\\}\\s*=\\s*${escape(namespace)}\\b`, "g");
    for (const match of source.matchAll(destructure)) {
      for (const item of match[1].split(",")) {
        const [original, local] = item.trim().split(/\s*:\s*/);
        if (new RegExp(`^(?:${sourceNames})$`).test(original)) aliases.add(local ?? original);
      }
    }
    const property = new RegExp(
      `(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*${escape(namespace)}(?:\\.(${sourceNames})|\\[\\s*["'](${sourceNames})["']\\s*\\])`,
      "g",
    );
    for (const match of source.matchAll(property)) aliases.add(match[1]);
  }
  return aliases;
}

function lineOf(source, index) {
  return source.slice(0, index).split("\n").length;
}

function callsOf(source, names) {
  const calls = [];
  for (const name of names) {
    const pattern = new RegExp(`\\b${escape(name)}\\b\\s*(?:<[^>]+>\\s*)?(?:\\(|\\[)`, "g");
    for (const match of source.matchAll(pattern)) calls.push(match.index);
  }
  return calls;
}

function propertyCallsOf(source, objects, properties) {
  const propertyPattern = properties.map(escape).join("|");
  const calls = [];
  for (const object of objects) {
    const pattern = new RegExp(
      `\\b${escape(object)}\\b\\s*(?:\\.\\s*(?:${propertyPattern})|\\[\\s*["'](?:${propertyPattern})["']\\s*\\])\\s*\\(`,
      "g",
    );
    for (const match of source.matchAll(pattern)) calls.push(match.index);
  }
  return calls;
}

export function scanSource(sourceRoot) {
  const violations = [];
  const allowed = {
    rawFetch: new Set(["lib/api/fetch-core.ts", "lib/api/client.ts", "lib/api/agent-client.ts", "sw.ts"]),
    apiFetch: new Set(["lib/api/client.ts", "lib/api/endpoints.ts", "lib/api/agent-client.ts", "lib/api/push-client.ts", "lib/api/workspaces.ts", "lib/auth/reconnect-token.ts"]),
    appFetch: new Set(["lib/api/client.ts", "lib/sw-coordinator.tsx", "lib/observability/web-vitals.ts"]),
    raw: new Set(["lib/api/fetch-core.ts", "lib/api/client.ts", "lib/api/agent-client.ts", "sw.ts"]),
  };

  for (const file of collectFiles(sourceRoot)) {
    const relative = normalize(path.relative(sourceRoot, file));
    const source = fs.readFileSync(file, "utf8");
    const add = (label, index) => violations.push(`${relative}:${lineOf(source, index)}: ${label}`);

    const clientImports = moduleImports(source, "client");
    const coreImports = moduleImports(source, "fetch-core");
    const endpointImports = moduleImports(source, "endpoints");
    const axiosImports = moduleImports(source, "axios");
    const rawFetchAliases = new Set([
      ...(clientImports.byName.get("rawFetch") ?? []),
      ...(coreImports.byName.get("rawFetch") ?? []),
      ...assignmentAliases(source, clientImports.namespaces, ["rawFetch"]),
      ...assignmentAliases(source, coreImports.namespaces, ["rawFetch"]),
    ]);
    const apiFetchAliases = new Set([
      ...(clientImports.byName.get("apiFetch") ?? []),
      ...assignmentAliases(source, clientImports.namespaces, ["apiFetch"]),
    ]);
    const appFetchAliases = new Set([
      ...(clientImports.byName.get("appFetch") ?? []),
      ...assignmentAliases(source, clientImports.namespaces, ["appFetch"]),
    ]);
    const axiosAliases = new Set([
      "axios",
      ...axiosImports.aliases,
      ...assignmentAliases(source, axiosImports.namespaces, ["axios"]),
    ]);

    if (!allowed.raw.has(relative)) {
      for (const index of callsOf(source, ["fetch"])) add("raw fetch outside approved transport", index);
      for (const index of callsOf(source, [...rawFetchAliases])) add("rawFetch outside approved transport", index);
    }
    if (!allowed.apiFetch.has(relative)) {
      for (const index of callsOf(source, ["apiFetch", ...apiFetchAliases])) add("apiFetch outside approved endpoint layer", index);
      for (const index of propertyCallsOf(source, clientImports.namespaces, ["apiFetch"])) add("namespaced apiFetch outside approved endpoint layer", index);
    }
    if (!allowed.appFetch.has(relative)) {
      for (const index of callsOf(source, ["appFetch", ...appFetchAliases])) add("appFetch outside approved infrastructure layer", index);
      for (const index of propertyCallsOf(source, clientImports.namespaces, ["appFetch"])) add("namespaced appFetch outside approved infrastructure layer", index);
    }
    if (!allowed.raw.has(relative)) {
      for (const index of callsOf(source, [...axiosAliases])) add("axios outside approved transport layer", index);
      for (const index of propertyCallsOf(source, [...axiosAliases, ...axiosImports.namespaces], ["request", "get", "post", "put", "patch", "delete"])) add("axios outside approved transport layer", index);
    }

    if (relative !== "lib/state/commands.ts") {
      const mutatorAliases = new Set([
        ...endpointImports.aliases,
        ...assignmentAliases(source, endpointImports.namespaces, MUTATORS),
      ]);
      for (const index of propertyCallsOf(source, ["endpoints", ...endpointImports.namespaces], MUTATORS)) {
        add("business mutator bypasses commands.ts", index);
      }
      for (const index of callsOf(source, [...mutatorAliases])) add("aliased business mutator bypasses commands.ts", index);
    }
  }
  return violations;
}

function main() {
  const sourceFlag = process.argv.indexOf("--source-root");
  const sourceRoot = sourceFlag >= 0 ? process.argv[sourceFlag + 1] : DEFAULT_SOURCE_ROOT;
  if (!sourceRoot || !fs.existsSync(sourceRoot)) throw new Error(`Missing source root: ${sourceRoot}`);
  const violations = scanSource(sourceRoot);
  if (violations.length) {
    console.error("PWA command boundary violations:");
    for (const violation of violations) console.error(`- ${violation}`);
    process.exitCode = 1;
    return;
  }
  console.log("PWA command boundary valid: business writes use commands.ts; transport exemptions are allowlisted.");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
