// ─────────────────────────────────────────────────────────────────────────────
// Shadow Mode Logger - Logs operations without executing them
// ─────────────────────────────────────────────────────────────────────────────

import { existsSync, mkdirSync, appendFileSync } from 'fs';
import { join } from 'path';

interface ShadowLogEntry {
  timestamp: string;
  intent: string;
  method: string;
  endpoint: string;
  payload: unknown;
  validation: 'passed' | 'failed';
  wouldWrite: boolean;
}

function getShadowLogPath(): string {
  const dataDir = join(process.cwd(), 'data', 'shadow');
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return join(dataDir, `log-${timestamp}.jsonl`);
}

export function logShadowOperation(entry: Omit<ShadowLogEntry, 'timestamp'>): void {
  const logPath = getShadowLogPath();
  const fullEntry: ShadowLogEntry = {
    timestamp: new Date().toISOString(),
    ...entry,
  };
  appendFileSync(logPath, JSON.stringify(fullEntry) + '\n');
}

export function isShadowMode(): boolean {
  return process.env.FINANCE_WRITE_MODE === 'shadow';
}

export function isWriteMethod(method: string): boolean {
  return ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method.toUpperCase());
}