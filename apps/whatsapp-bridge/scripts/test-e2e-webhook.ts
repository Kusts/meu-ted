/**
 * Print full tool_execution_end event
 */
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'node:fs';
import { createPiClient } from '../src/pi-client-factory.js';
import { loadEnv } from '../src/env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
let REPO_ROOT = resolve(__dirname, '../../..');
if (!existsSync(resolve(REPO_ROOT, 'package.json'))) REPO_ROOT = resolve(__dirname, '../../../..');

async function main() {
  loadEnv(process.cwd());

  const HH = '550e8400-e29b-41d4-a716-446655440000';
  const piClient = createPiClient(HH);
  await (piClient as any).warmup?.();
  await new Promise(r => setTimeout(r, 1000));

  const client = (piClient as any).client;

  const events = await client.promptAndWait(
    'Call list_accounts with householdId = "550e8400-e29b-41d4-a716-446655440000". Return the full output including the ID field.',
    undefined, 30000
  ).catch(err => { console.error(err.message); return null; });

  if (!events) { await (piClient as any).stop?.(); return; }

  const toolEnds = events.filter(e => (e as any).type === 'tool_execution_end');
  for (const e of toolEnds) {
    const ev = e as any;
    // Print full event keys
    console.log('tool_execution_end keys:', Object.keys(ev).join(', '));
    // Print result fully
    console.log('result:', JSON.stringify(ev.result, null, 2));
    // Print output if different from result
    if (ev.output && ev.output !== ev.result) {
      console.log('output:', JSON.stringify(ev.output, null, 2));
    }
    // Print the full event (truncated)
    console.log('full event:', JSON.stringify(ev).slice(0, 2000));
  }

  await (piClient as any).stop?.();
}

main().catch(err => { console.error('Error:', err.message); process.exit(1); });