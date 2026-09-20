#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REQUIRED_BINDINGS = ['workspaceId', 'actorId', 'deviceId', 'proposalHash', 'pendingOperationId', 'idempotencyKey'];
const EXCLUDED_SEGMENTS = new Set(['docs', 'test', 'tests', 'spec', 'specs', 'fixtures', 'generated', 'dist', 'build', 'coverage', 'node_modules']);

const normalize = (value) => value.replaceAll('\\', '/');

function walk(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) return walk(full);
    return /\.(?:ts|tsx|js|jsx|mjs|cjs)$/.test(entry.name) ? [full] : [];
  });
}

function isExcluded(root, filePath) {
  const relative = normalize(path.relative(root, filePath));
  const segments = relative.toLowerCase().split('/');
  return segments.some((segment) => EXCLUDED_SEGMENTS.has(segment) || /\.(?:test|spec)\.[^.]+$/.test(segment));
}

function lineOf(source, index) {
  return source.slice(0, index).split(/\r?\n/).length;
}

function lineTextOf(source, index) {
  const start = index > 0 ? source.lastIndexOf('\n', index - 1) + 1 : 0;
  let end = source.indexOf('\n', index);
  if (end === -1) end = source.length;
  return source.slice(start, end);
}

/**
 * Mask comment bodies with spaces (length-preserving, so match indices and
 * line numbers stay valid). A capability string mentioned in prose
 * documentation is not a capability USE — matching it is a false positive.
 * Code (including string literals) is left intact so real uses still flag.
 */
function maskComments(source) {
  const withoutBlocks = source.replace(/\/\*[\s\S]*?\*\//g, (match) =>
    match.replace(/[^\n]/g, ' '),
  );
  return withoutBlocks.replace(/\/\/[^\n]*/g, (match, offset, full) => {
    const prev = offset > 0 ? full[offset - 1] : '\n';
    // Keep `https://`-style sequences and `//` inside quotes untouched.
    if (prev === ':' || prev === "'" || prev === '"' || prev === '`') return match;
    return ' '.repeat(match.length);
  });
}

/**
 * A4 allowlist (narrow, auditable): the API preHandler in
 * `apps/api/src/routes/index.ts` is the delegated-capability VERIFIER — it
 * fail-closed CHECKS `claims.capabilities` and never mints or grants a
 * capability. Only the `mutationCapability` verifier definition line is
 * exempt; any other `financial.write` literal in that file (minting,
 * defaulting, granting) still flags, as does every occurrence elsewhere.
 * Issuance outside MutationExecutor (Agent) stays forbidden.
 */
function isApiVerifierDefinition(relative, source, index) {
  if (relative !== 'apps/api/src/routes/index.ts') return false;
  const line = lineTextOf(source, index);
  return line.includes('mutationCapability') && line.includes('financial.write');
}

function diagnostic(code, root, filePath, source, index, message) {
  return {
    code,
    file: normalize(path.relative(root, filePath)),
    line: lineOf(source, index),
    message,
  };
}

function isMutationExecutor(filePath, source) {
  return /(?:^|[/\\])mutation[-_]executor\.[^.]+$/i.test(filePath)
    || /class\s+MutationExecutor\b/.test(source);
}

export function collectProductionFiles(root) {
  const roots = [
    path.join(root, 'apps', 'agent', 'src'),
    path.join(root, 'apps', 'api', 'src'),
    path.join(root, 'apps', 'pwa', 'src'),
  ];
  return roots.flatMap((directory) => walk(directory)).filter((filePath) => !isExcluded(root, filePath));
}

export function checkInvariants(root = path.resolve(SCRIPT_DIR, '..')) {
  const diagnostics = [];
  const files = collectProductionFiles(root);
  let manifestFiles = [];

  for (const filePath of files) {
    const source = fs.readFileSync(filePath, 'utf8');
    const executor = isMutationExecutor(filePath, source);
    const relative = normalize(path.relative(root, filePath));

    if (relative === 'apps/agent/src/finance-chat-agent.ts') {
      const constructors = [...source.matchAll(/new\s+ConversationOrchestrator\s*\(/g)];
      if (constructors.length !== 1) {
        diagnostics.push(diagnostic('A9_SINGLE_CONVERSATION_PIPELINE', root, filePath, source, constructors[1]?.index ?? 0, 'FinanceChatAgent must construct exactly one canonical ConversationOrchestrator adapter'));
      }
      for (const match of source.matchAll(/tryV2MutationProposal/g)) {
        diagnostics.push(diagnostic('A9_SINGLE_CONVERSATION_PIPELINE', root, filePath, source, match.index, 'REST mutation proposals must not bypass the canonical ConversationOrchestrator'));
      }
    }

    if (relative === 'apps/agent/src/index.ts') {
      for (const match of source.matchAll(/return\s+this\.(?:processTurn|retryTurn)\(path\.split\("\/message\/"\)/g)) {
        diagnostics.push(diagnostic('A10_LEGACY_HTTP_EXECUTION', root, filePath, source, match.index, 'Legacy HTTP process/retry endpoints must remain retired'));
      }
    }

    for (const match of source.matchAll(/\[EXEC_ACTION(?::|\])/g)) {
      diagnostics.push(diagnostic('A2_EXEC_ACTION', root, filePath, source, match.index, 'LLM execution marker is present in production source'));
    }

    if (relative.startsWith('apps/pwa/src/')) {
      for (const match of source.matchAll(/["'`]\/pending-operations(?:\/|["'`])/g)) {
        diagnostics.push(diagnostic('A7_PWA_DIRECT_PENDING_OPERATION', root, filePath, source, match.index, 'PWA must send approval decisions only through the Agent RPC'));
      }
      for (const match of source.matchAll(/\battestation\b/gi)) {
        diagnostics.push(diagnostic('A8_PWA_ATTESTATION_EXPOSURE', root, filePath, source, match.index, 'PWA must not receive, persist, or submit an approval attestation'));
      }
    }

    for (const match of source.matchAll(/\b(?:workspaceId|memoryWorkspace)\s*(?::|=)\s*["']direct["']/g)) {
      diagnostics.push(diagnostic('A3_DIRECT_NAMESPACE', root, filePath, source, match.index, 'direct namespace is not a valid production transport binding'));
    }

    if (!executor) {
      // Match against comment-masked code: prose mentions are not uses.
      const code = maskComments(source);
      for (const match of code.matchAll(/financial\.write/g)) {
        if (isApiVerifierDefinition(relative, code, match.index)) continue;
        diagnostics.push(diagnostic('A4_WRITE_CAPABILITY_OUTSIDE_EXECUTOR', root, filePath, source, match.index, 'financial.write capability/default appears outside MutationExecutor'));
      }
      // Obfuscated construction (join/concat/array-split) must never bypass
      // the gate: the capability has to appear as an auditable open literal.
      for (const match of code.matchAll(/['"]financial['"]\s*,\s*['"]write['"]/g)) {
        diagnostics.push(diagnostic('A4_WRITE_CAPABILITY_OUTSIDE_EXECUTOR', root, filePath, source, match.index, 'financial.write capability assembled obliquely (join/concat) outside MutationExecutor — use the open literal so the gate can audit it'));
      }
      for (const match of code.matchAll(/\b(?:mutationApproved|approvedTool)\b/g)) {
        diagnostics.push(diagnostic('A5_MUTATION_ISSUER_OUTSIDE_EXECUTOR', root, filePath, source, match.index, 'mutation approval issuer appears outside MutationExecutor'));
      }
    }

    if (/binding[-_]manifest/i.test(path.basename(filePath))) manifestFiles.push({ filePath, source });
  }

  if (manifestFiles.length === 0) {
    diagnostics.push({ code: 'A6_BINDING_MANIFEST_INCOMPLETE', file: 'apps/agent/src', line: 1, message: 'V2 binding manifest is missing' });
  } else {
    const fields = new Set(manifestFiles.flatMap(({ source }) => REQUIRED_BINDINGS.filter((field) => new RegExp(`\\b${field}\\b`).test(source))));
    const missing = REQUIRED_BINDINGS.filter((field) => !fields.has(field));
    if (missing.length) {
      const { filePath, source } = manifestFiles[0];
      diagnostics.push(diagnostic('A6_BINDING_MANIFEST_INCOMPLETE', root, filePath, source, 0, `V2 binding manifest is missing: ${missing.join(', ')}`));
    }
  }

  return { root, filesScanned: files.length, diagnostics };
}

function main() {
  const rootArg = process.argv.find((arg) => arg.startsWith('--root='));
  const root = path.resolve(rootArg ? rootArg.slice('--root='.length) : path.resolve(SCRIPT_DIR, '..'));
  const result = checkInvariants(root);
  if (result.diagnostics.length) {
    for (const item of result.diagnostics) console.error(`${item.code} ${item.file}:${item.line} ${item.message}`);
    console.error(`Agent V2 invariants RED: ${result.diagnostics.length} diagnostics (${result.filesScanned} production files scanned)`);
    process.exitCode = 1;
    return;
  }
  console.log(`Agent V2 invariants GREEN: ${result.filesScanned} production files scanned`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
