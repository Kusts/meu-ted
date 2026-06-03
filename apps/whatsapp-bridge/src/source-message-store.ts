import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname } from 'path';
import type { SourceMessageStore } from './webhook-handler.js';

export function createSourceMessageStore(path: string): SourceMessageStore {
  const seen = loadSeen(path);

  return {
    isProcessed: (id) => seen.has(id),
    markProcessed: (msg) => {
      seen.add(msg.providerMessageId);
      persistSeen(path, seen);
    },
    saveError: () => {
      // intentionally swallow — webhook handler keeps local error state
    },
  };
}

function loadSeen(path: string): Set<string> {
  try {
    const raw = readFileSync(path, 'utf-8');
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set<string>();
    const ids = parsed.filter((value): value is string => typeof value === 'string');
    return new Set(ids);
  } catch {
    return new Set<string>();
  }
}

function persistSeen(path: string, seen: Set<string>): void {
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify([...seen]), 'utf-8');
  } catch {
    // graceful fallback: keep in-memory dedupe only
  }
}
