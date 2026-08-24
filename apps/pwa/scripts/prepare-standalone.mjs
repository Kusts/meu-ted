import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pwaDir = path.resolve(__dirname, '..');
const nextDir = path.join(pwaDir, '.next');
const standaloneNextDir = path.join(pwaDir, '.next', 'standalone', 'apps', 'pwa', '.next');

if (fs.existsSync(nextDir)) {
  fs.mkdirSync(standaloneNextDir, { recursive: true });
  
  // Copy root .next files (BUILD_ID, *.json)
  const rootFiles = fs.readdirSync(nextDir).filter(f => !fs.statSync(path.join(nextDir, f)).isDirectory());
  for (const file of rootFiles) {
    const src = path.join(nextDir, file);
    const dest = path.join(standaloneNextDir, file);
    if (!fs.existsSync(dest)) {
      fs.copyFileSync(src, dest);
    }
  }

  // Copy server files (*.json)
  const serverDir = path.join(nextDir, 'server');
  const standaloneServerDir = path.join(standaloneNextDir, 'server');
  if (fs.existsSync(serverDir)) {
    fs.mkdirSync(standaloneServerDir, { recursive: true });
    const serverFiles = fs.readdirSync(serverDir).filter(f => f.endsWith('.json'));
    for (const file of serverFiles) {
      const src = path.join(serverDir, file);
      const dest = path.join(standaloneServerDir, file);
      if (!fs.existsSync(dest)) {
        fs.copyFileSync(src, dest);
      }
    }
  }
}
