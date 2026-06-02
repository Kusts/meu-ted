#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// TED Finance CLI - Entry Point
// Uses compiled JavaScript from dist/
// ─────────────────────────────────────────────────────────────────────────────

import { runCommand } from '../dist/index.js';

const args = process.argv.slice(2);

runCommand(args).catch((error) => {
  console.error(JSON.stringify({
    success: false,
    reason: error instanceof Error ? error.message : 'Erro desconhecido',
  }));
  process.exit(1);
});