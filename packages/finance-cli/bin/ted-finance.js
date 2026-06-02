#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// TED Finance CLI - Entry Point
// Deterministic CLI helper for financial operations
// Uses tsx to load TypeScript directly (no build step needed)
// ─────────────────────────────────────────────────────────────────────────────

import { runCommand } from '../src/index.ts';

const args = process.argv.slice(2);

runCommand(args).catch((error) => {
  console.error(JSON.stringify({
    success: false,
    reason: error instanceof Error ? error.message : 'Erro desconhecido',
  }));
  process.exit(1);
});