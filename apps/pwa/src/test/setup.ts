import { expect } from "vitest";
import * as jestDomMatchers from "@testing-library/jest-dom/matchers";

expect.extend(jestDomMatchers);

function createMemoryStorage(): Storage {
  const values = new Map<string, string>();

  return {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key) {
      return values.get(key) ?? null;
    },
    key(index) {
      return Array.from(values.keys())[index] ?? null;
    },
    removeItem(key) {
      values.delete(key);
    },
    setItem(key, value) {
      values.set(String(key), String(value));
    },
  };
}

function ensureStorage(name: "localStorage" | "sessionStorage") {
  const storage = createMemoryStorage();
  try {
    if (typeof window !== "undefined") {
      Object.defineProperty(window, name, { configurable: true, writable: true, value: storage });
    }
  } catch {}
  try {
    Object.defineProperty(globalThis, name, {
      configurable: true,
      writable: true,
      value: storage,
    });
  } catch {}
}

ensureStorage("localStorage");
ensureStorage("sessionStorage");
