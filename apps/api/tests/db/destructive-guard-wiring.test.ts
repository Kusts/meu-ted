import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const integrationFiles = [
  'postgres-store.test.ts',
  'postgres-write-store.test.ts',
];

describe('G0.0 — destructive Postgres test guard wiring', () => {
  it('requires the marker guard before every integration TRUNCATE', () => {
    for (const file of integrationFiles) {
      const source = readFileSync(resolve(import.meta.dirname, '../integration', file), 'utf8');
      let offset = source.indexOf('TRUNCATE');
      while (offset >= 0) {
        if (!source.slice(offset, offset + 40).includes('TRUNCATE TABLE')) {
          offset = source.indexOf('TRUNCATE', offset + 1);
          continue;
        }
        const context = source.slice(Math.max(0, offset - 240), offset);
        expect(context, file).toContain('requireTestDatabase');
        offset = source.indexOf('TRUNCATE', offset + 1);
      }
    }
  });
});
