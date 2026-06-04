/**
 * Phase 6 Slice 3 — Minimal Extension Test
 *
 * Test the extension by running pi with -e flag pointing directly to it.
 */

import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { realpathSync } from 'node:fs';
import { createRequire } from 'module';
import { spawn } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../../..');

function resolvePiAgentCli(): string {
  const req = createRequire(import.meta.url);
  let dir = __dirname;
  for (let i = 0; i < 10; i++) {
    try {
      return realpathSync(resolve(dir, 'node_modules/@earendil-works/pi-coding-agent/dist/cli.js'));
    } catch { /* walk up */ }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return resolve(__dirname, '../../node_modules/@earendil-works/pi-coding-agent/dist/cli.js');
}

async function main() {
  console.log('=== Phase 6 Slice 3: Minimal Extension Test ===\n');

  const cliPath = resolvePiAgentCli();
  console.log('✓ Pi CLI:', cliPath);

  // Path to the extension index.ts (in repo root .pi/extensions/)
  // scripts/ is at depth 4 from repo root: repo/apps/whatsapp-bridge/scripts
  const extPath = resolve(__dirname, '../../../../.pi/extensions/financial-tools/index.ts');
  console.log('✓ Extension path:', extPath);

  // Run: pi -e <extension-path> --print "list_accounts tool help"
  const message = 'What tools do you have available? List all custom tools you know about.';
  const args = [
    '-e', extPath,
    '--no-session',
    '--print',
    message,
  ];

  console.log(`\n--- Running: pi ${args.join(' ')} ---`);

  return new Promise<void>((resolveRun) => {
    const proc = spawn(cliPath, args, {
      cwd: REPO_ROOT,
      env: { ...process.env, DATABASE_URL: 'postgresql://postgres@localhost:5432/pi_financeiro' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    proc.stdout?.on('data', (d) => {
      const s = d.toString();
      stdout += s;
      process.stdout.write(s);
    });
    proc.stderr?.on('data', (d) => {
      const s = d.toString();
      stderr += s;
      process.stderr.write(s);
    });
    proc.on('close', (code) => {
      console.log(`\n--- Process exited with code ${code} ---`);
      console.log('Stderr:', stderr.slice(0, 500) || '(empty)');
      console.log('Stdout:', stdout.slice(0, 1000) || '(empty)');

      if (stdout.includes('list_accounts') || stdout.includes('create_expense') || stdout.includes('get_balance')) {
        console.log('\n✅ SUCCESS: Extension tools found in output');
      } else if (stderr.includes('Error') || stderr.includes('error')) {
        console.log('\n⚠️ Extension may have errors:', stderr.slice(0, 300));
      } else {
        console.log('\n⚠️ Tools not detected in output (model may not list them)');
      }

      resolveRun();
    });
    proc.on('error', (err) => {
      console.error('❌ Process error:', err.message);
      resolveRun();
    });
  });
}

main().catch(err => {
  console.error('❌ Failed:', err.message);
  process.exit(1);
});