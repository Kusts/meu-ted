import { spawnSync } from 'node:child_process';

const gate = process.argv[2];
const allPackages = ['pi-finance-api', '@pi-financeiro/whatsapp-bridge', 'pwa'];
const requestedFilter = process.argv[3] === '--filter' ? process.argv[4] : undefined;
const aliases = {
  api: 'pi-finance-api',
  'pi-finance-api': 'pi-finance-api',
  bridge: '@pi-financeiro/whatsapp-bridge',
  'whatsapp-bridge': '@pi-financeiro/whatsapp-bridge',
  pwa: 'pwa',
  agent: 'pi-finance-agent',
};
const packages = requestedFilter ? [aliases[requestedFilter] ?? requestedFilter] : allPackages;
const allowed = new Set(['lint', 'typecheck', 'test', 'build']);

if (!allowed.has(gate)) {
  console.error(`Unknown workspace gate: ${gate ?? '(missing)'}`);
  process.exit(2);
}

const command = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
for (const pkg of packages) {
  const result = spawnSync(command, ['--filter', pkg, gate], {
    cwd: process.cwd(),
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}
