#!/usr/bin/env node
import { execFileSync } from 'node:child_process';

const suffix = `${Date.now()}-${process.pid}`;
const containers = [];

const docker = (args, options = {}) => execFileSync('docker', args, {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
  ...options,
}).trim();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const start = (name, image, containerPort, env = []) => {
  const container = `${name}-${suffix}`;
  // Do not use --rm: an early bootstrap failure must remain inspectable long
  // enough for this script to include its logs, then `finally` removes it.
  const args = ['run', '--detach', '--name', container, '--publish', `127.0.0.1::${containerPort}`];
  for (const [key, value] of env) args.push('--env', `${key}=${value}`);
  args.push(image);
  docker(args);
  containers.push(container);
  const port = docker(['inspect', '--format', `{{(index (index .NetworkSettings.Ports "${containerPort}/tcp") 0).HostPort}}`, container]);
  const user = docker(['inspect', '--format', '{{.Config.User}}', container]);
  if (!user) throw new Error(`${name} image must run as a non-root user`);
  return { container, port };
};

const waitForHealth = async (name, port) => {
  const url = `http://127.0.0.1:${port}/health`;
  let lastError = 'not started';
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        console.log(`${name} health GREEN (${url})`);
        return;
      }
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await sleep(500);
  }
  throw new Error(`${name} health RED: ${lastError}`);
};

try {
  docker(['info', '--format', '{{.ServerVersion}}']);
  const api = start('pi-finance-api-smoke', 'pi-finance-api:ci', 3001, [
    ['NODE_ENV', 'test'],
    ['MIGRATIONS_MODE', 'disabled'],
  ]);
  const broker = start('pi-finance-codex-broker-smoke', 'pi-finance-codex-broker:ci', 3005);
  await waitForHealth('API', api.port);
  await waitForHealth('Codex Broker', broker.port);
  console.log('Container smoke GREEN: API and Codex Broker are non-root and healthy.');
} catch (error) {
  for (const container of containers) {
    try {
      const logs = docker(['logs', container]);
      if (logs) console.error(`--- ${container} logs ---\n${logs}`);
    } catch {}
  }
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  for (const container of containers.reverse()) {
    try { docker(['rm', '--force', container]); } catch {}
  }
}
