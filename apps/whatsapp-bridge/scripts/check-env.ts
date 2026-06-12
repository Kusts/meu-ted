/**
 * Check what env the bridge process actually has.
 * Run from the bridge dir and check DATABASE_URL
 */
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
let REPO_ROOT = resolve(__dirname, '../../..');
if (!existsSync(resolve(REPO_ROOT, 'package.json'))) REPO_ROOT = resolve(__dirname, '../../../..');

async function main() {
  console.log('=== Env Check ===');
  console.log('process.cwd():', process.cwd());
  console.log('REPO_ROOT:', REPO_ROOT);

  // What does loadEnv find?
  const { loadEnv } = await import('../src/env.js');

  console.log('\nBEFORE loadEnv:');
  console.log('  DATABASE_URL:', JSON.stringify(process.env.DATABASE_URL));
  console.log('  PI_AGENT_RUNTIME:', JSON.stringify(process.env.PI_AGENT_RUNTIME));

  loadEnv(process.cwd());

  console.log('\nAFTER loadEnv(process.cwd()):');
  console.log('  DATABASE_URL:', JSON.stringify(process.env.DATABASE_URL));
  console.log('  PI_AGENT_RUNTIME:', JSON.stringify(process.env.PI_AGENT_RUNTIME));

  // What does loadEnv return from the root?
  loadEnv(REPO_ROOT);
  console.log('\nAFTER loadEnv(REPO_ROOT):');
  console.log('  DATABASE_URL:', JSON.stringify(process.env.DATABASE_URL));

  // Check if .env file exists and what's in it
  const { readFileSync, existsSync: exists } = await import('node:fs');
  const envPath = resolve(REPO_ROOT, '.env');
  console.log('\n.env exists at REPO_ROOT:', exists(envPath));
  if (exists(envPath)) {
    console.log('.env content (filtered):');
    const lines = readFileSync(envPath, 'utf-8').split('\n');
    for (const line of lines) {
      if (line.includes('DATABASE') || line.includes('PG_') || line.includes('PI_')) {
        console.log('  ' + line.trim());
      }
    }
  }
}

main().catch(err => console.error('Error:', err.message));