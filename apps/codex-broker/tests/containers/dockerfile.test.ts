import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const dockerfile = readFileSync(resolve(process.cwd(), 'Dockerfile'), 'utf8');
const server = readFileSync(resolve(process.cwd(), 'src/server.ts'), 'utf8');
const tsconfig = readFileSync(resolve(process.cwd(), 'tsconfig.build.json'), 'utf8');
const packageJson = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8')) as {
  scripts?: Record<string, string>;
};

describe('Codex Broker canonical container', () => {
  it('ships emitted dist output and starts it as a non-root health-checked image', () => {
    expect(tsconfig).toMatch(/"outDir"\s*:\s*"dist"/);
    expect(packageJson.scripts?.build).toMatch(/tsc/);
    expect(dockerfile).toMatch(/COPY --from=builder \/monorepo\/apps\/codex-broker\/dist \.\/dist/);
    expect(dockerfile).toMatch(/USER appuser/);
    expect(dockerfile).toContain('HEALTHCHECK');
    expect(dockerfile).toContain('/health');
    expect(dockerfile).toMatch(/CMD \["node", "dist\/server\.js"\]/);
    expect(server).toContain('app.listen');
  });
});
