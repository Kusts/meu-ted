/**
 * Phase 6 Slice 3 — Extension Loading Test
 * Run: npx tsx apps/whatsapp-bridge/scripts/test-extension-loading.ts
 */

import { resolve, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { existsSync } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// scripts/ = repo/apps/whatsapp-bridge/scripts; go up 3 to pi-financeiro
const REPO_ROOT = resolve(__dirname, '../../..');

async function main() {
  const extPathUrl = pathToFileURL(resolve(REPO_ROOT, '.pi/extensions/financial-tools/index.ts')).href;
  const jitiPath = resolve(REPO_ROOT, 'node_modules/.pnpm/jiti@2.7.0/node_modules/jiti/lib/jiti.mjs');
  const piAgentDist = pathToFileURL(resolve(REPO_ROOT, 'node_modules/.pnpm/@earendil-works+pi-coding-agent@0.78.0_ws@8.21.0_zod@4.4.3/node_modules/@earendil-works/pi-coding-agent/dist/index.js')).href;

  console.log('REPO_ROOT:', REPO_ROOT);
  console.log('Extension:', extPathUrl);
  console.log('Jiti:', pathToFileURL(jitiPath).href);

  if (!existsSync(jitiPath)) { console.error('❌ jiti not found at', jitiPath); process.exit(1); }

  const jitiModule = await import(pathToFileURL(jitiPath).href);
  const createJiti: (origin: URL, opts?: object) => { import: (path: string, opts?: object) => Promise<unknown> } =
    (jitiModule.createJiti ?? jitiModule.default?.createJiti ?? jitiModule.default) as any;
  if (typeof createJiti !== 'function') throw new Error(`createJiti is ${typeof createJiti}`);

  const jiti = createJiti(import.meta.url, { alias: { '@earendil-works/pi-coding-agent': piAgentDist }, moduleCache: false, tryNative: false });

  try {
    const ext = await jiti.import(extPathUrl, { default: true });
    const registeredTools: string[] = [];
    const mockPi = {
      registerTool: (def: { name: string }) => { registeredTools.push(def.name); },
      on: () => {},
      registerCommand: () => {},
    };

    const factory = typeof ext === 'function' ? ext : (ext as { default?: unknown }).default;
    if (typeof factory !== 'function') throw new Error('No factory found');

    await factory(mockPi);

    console.log(`\n📋 Registered tools: ${registeredTools.length}`);
    registeredTools.forEach(t => console.log(`  - ${t}`));

    if (registeredTools.length >= 17) {
      console.log(`\n✅ SUCCESS: ${registeredTools.length}/17+ tools registered via jiti`);
    } else {
      console.log(`\n⚠️ PARTIAL: ${registeredTools.length}/17 tools`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('❌ Failed:', msg);
    process.exit(1);
  }
}

main().catch(err => { console.error('❌ Top-level:', err instanceof Error ? err.message : String(err)); process.exit(1); });