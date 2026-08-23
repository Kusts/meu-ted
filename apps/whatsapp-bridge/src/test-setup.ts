// Polyfill/stub for undici / Node 24 webidl compatibility in Vitest
const webidlSymbol = Symbol.for('nodejs.webidl');
const webidl = (globalThis as any)[webidlSymbol];
if (webidl) {
  if (!webidl.util) webidl.util = {};
  if (typeof webidl.util.markAsUncloneable !== 'function') {
    webidl.util.markAsUncloneable = () => {};
  }
}
