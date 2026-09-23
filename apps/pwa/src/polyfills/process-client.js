/**
 * Client-side replacement for Next's process polyfill
 * (next/dist/build/polyfills/process.js).
 *
 * Next 16.3.x `--webpack` client builds emit that polyfill whose fallback
 * `require('next/dist/compiled/process')` is assigned a module id that never
 * gets a factory in the emitted chunk graph. In a browser (no
 * `globalThis.process`) evaluating the polyfill throws at chunk load and the
 * whole PWA client crashes at boot (stuck on the SSR fallback screen).
 *
 * next.config.ts aliases the polyfill's resolved path to this stub for client
 * compilations only. Runtime contract is identical: prefer the real global
 * process when it has an env object, otherwise serve a minimal no-op object.
 * Env reads compiled by DefinePlugin never reach this module.
 */
"use strict";

const globalRef = typeof globalThis !== "undefined" ? globalThis : undefined;
const globalProcess =
  globalRef && globalRef.process && typeof globalRef.process.env === "object"
    ? globalRef.process
    : undefined;

module.exports =
  globalProcess ??
  {
    env: {},
    browser: true,
    title: "browser",
    version: "",
    versions: {},
    argv: [],
    nextTick(fn, ...args) {
      if (typeof fn !== "function") return;
      queueMicrotask(() => fn(...args));
    },
    on() {},
    addListener() {},
    once() {},
    off() {},
    removeListener() {},
    removeAllListeners() {},
    emit() {},
    listeners() {
      return [];
    },
    cwd() {
      return "/";
    },
    umask() {
      return 0;
    },
  };
