import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const dockerfile = readFileSync(resolve(process.cwd(), 'Dockerfile'), 'utf8');
const contractsPackage = JSON.parse(readFileSync(resolve(process.cwd(), '../../packages/llm-contracts/package.json'), 'utf8')) as {
  exports: Record<string, { default: string }>;
};

describe('API canonical container', () => {
  it('builds the workspace contract and runs as a non-root health-checked image', () => {
    expect(dockerfile).toMatch(/FROM node:24-alpine AS builder/);
    expect(dockerfile).toContain('COPY packages packages');
    expect(dockerfile).toContain('pnpm --filter @pi-finance/llm-contracts build');
    expect(dockerfile).toContain('pnpm deploy --legacy --filter meu-ted-api --prod /runtime');
    expect(dockerfile).toContain('COPY --from=builder /runtime/node_modules ./node_modules');
    expect(dockerfile).toContain('USER appuser');
    expect(dockerfile).toContain('HEALTHCHECK');
    expect(dockerfile).toContain('/health');
    expect(dockerfile).toContain('MIGRATIONS_MODE=disabled');
  });

  it('uses emitted JavaScript for the shared runtime contract', () => {
    expect(contractsPackage.exports['.']?.default).toBe('./dist/index.js');
    expect(contractsPackage.exports['./types']?.default).toBe('./dist/types.js');
    expect(contractsPackage.exports['./schemas']?.default).toBe('./dist/schemas.js');
  });
});
