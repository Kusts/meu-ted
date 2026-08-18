import { spawnSync } from 'node:child_process';
import process from 'node:process';

const image = 'zricethezav/gitleaks:v8.24.2';
const args = [
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

const checkDocker = spawnSync('docker', ['info'], { stdio: 'ignore', shell: false });
if (checkDocker.status !== 0) {
  console.log('Docker daemon not running locally. Skipping containerized gitleaks (verified in CI).');
  process.exit(0);
}

const result = spawnSync('docker', args, { stdio: 'inherit', shell: false });
if (result.error) {
  console.error(`Unable to run Docker/Gitleaks: ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status ?? 1);

