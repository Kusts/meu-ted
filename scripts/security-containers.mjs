import { spawnSync } from 'node:child_process';
import { validateTrivyignoreFile } from './trivyignore-policy.mjs';

const images = ['pi-finance-api:ci', 'pi-finance-codex-broker:ci'];
const repoPath = process.cwd();
const ignoreValidation = validateTrivyignoreFile(repoPath);
if (!ignoreValidation.ok) {
  console.error('Refusing container scan: .trivyignore failed expiry validation (fail-closed).');
  for (const error of ignoreValidation.errors) console.error(` - ${error}`);
  console.error('Each ignored CVE needs a parseable, unexpired `Expiry: YYYY-MM-DD` declaration.');
  process.exit(1);
}
const hasIgnore = ignoreValidation.entries.length > 0;

const commonArgs = [
  'run',
  '--rm',
  '-v',
  'trivy-cache:/root/.cache/trivy',
  '-v',
  '/var/run/docker.sock:/var/run/docker.sock',
  '-v',
  `${repoPath}:/repo:ro`,
  'aquasec/trivy:0.58.1',
  'image',
  '--scanners',
  'vuln',
  '--exit-code',
  '1',
  '--severity',
  'HIGH,CRITICAL',
  '--ignore-unfixed',
  ...(hasIgnore ? ['--ignorefile', '/repo/.trivyignore'] : []),
];

const checkDocker = spawnSync('docker', ['info'], { stdio: 'ignore', shell: false });
if (checkDocker.status !== 0) {
  console.log('Docker daemon not running locally. Skipping containerized trivy (verified in CI).');
  process.exit(0);
}

for (const image of images) {

  const result = spawnSync('docker', [...commonArgs, image], {
    stdio: 'inherit',
    shell: false,
  });
  if (result.error) {
    console.error(`Unable to run Docker/Trivy: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}
