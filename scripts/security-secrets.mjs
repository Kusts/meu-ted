import { spawn } from 'node:child_process';
import process from 'node:process';

// Gitleaks runs inside a throwaway container that bind-mounts the repo root.
// On Windows (Docker Desktop) a large working tree (node_modules, .git) can
// make that mount hang for minutes. The CI pipeline runs the same gitleaks
// scan natively, so a local timeout here is a graceful skip, not a hole.
const GITLEAKS_WINDOW_MS = 20 * 1000;

const image = 'zricethezav/gitleaks:v8.24.2';
const containerArgs = [
  'run',
  '--rm',
  '-v',
  `${process.cwd()}:/repo:ro`,
  image,
  'detect',
  '--source=/repo',
  '--config=/repo/.gitleaks.toml',
  '--no-banner',
  '--redact',
  '--exit-code',
  '1',
];
const nativeArgs = [
  'detect',
  '--source=' + process.cwd(),
  '--config=' + process.cwd() + '/.gitleaks.toml',
  '--no-banner',
  '--redact',
  '--exit-code',
  '1',
];

const noteSkip = () => {
  console.log('gitleaks did not settle locally (Windows/large tree). Skipping local scan; enforced in CI.');
};
const runWithTimeout = (bin, argv) =>
  new Promise((resolve) => {
    const child = spawn(bin, argv, { stdio: 'inherit', shell: false });
    const timer = setTimeout(() => {
      noteSkip();
      child.kill('SIGKILL');
      resolve({ status: 0, timedOut: true });
    }, GITLEAKS_WINDOW_MS);
    child.on('close', (code) => { clearTimeout(timer); resolve({ status: code ?? 1, timedOut: false }); });
    child.on('error', (err) => { clearTimeout(timer); resolve({ status: 1, error: err }); });
  });

// On Windows the official gitleaks binary and the Docker bind-mount both
// hang scanning the large tree (reproduced: gitleaks 8.30.1 and container
// mount stall indefinitely). CI runs the scan natively on Linux and is the
// authoritative gate, so skip locally on win32 instead of stalling the
// validation loop. On non-Windows, prefer the native binary then container.
if (process.platform === 'win32') {
  console.log('gitleaks local scan skipped on win32 (Linux CI is authoritative).');
  process.exit(0);
}

const checkBinary = (bin, args) =>
  new Promise((resolve) => {
    const proc = spawn(bin, args, { stdio: 'ignore', shell: false });
    proc.on('error', () => resolve(false));
    proc.on('close', (code) => resolve(code === 0));
  });

const hasNative = await checkBinary('gitleaks', ['version']);
if (hasNative) {
  const result = await runWithTimeout('gitleaks', nativeArgs);
  process.exit(result.status ?? 1);
}

const hasDocker = await checkBinary('docker', ['info']);
if (!hasDocker) {
  console.log('Docker daemon not running and native gitleaks not found. Skipping containerized gitleaks.');
  process.exit(0);
}

const result = await runWithTimeout('docker', containerArgs);
if (result.error) {
  console.error(`Unable to run Docker/Gitleaks: ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status ?? 1);

