import { createRequire } from 'node:module';

try {
  const require = createRequire(import.meta.url);
  const wt = require('node:worker_threads');
  if (wt && typeof wt.markAsUncloneable !== 'function') {
    try {
      Object.defineProperty(wt, 'markAsUncloneable', {
        value: () => {},
        configurable: true,
        writable: true,
      });
    } catch {
      // ignore if non-configurable
    }
  }
} catch {}

try {
  const symbols = [Symbol.for('nodejs.webidl'), Symbol.for('undici.webidl')];
  for (const sym of symbols) {
    const webidl = (globalThis as any)[sym];
    if (webidl) {
      if (!webidl.util) webidl.util = {};
      if (typeof webidl.util.markAsUncloneable !== 'function') {
        webidl.util.markAsUncloneable = () => {};
      }
    }
  }
} catch {}
